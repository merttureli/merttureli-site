#!/usr/bin/env python3
"""
Make web-ready images, videos and posters, print the HTML to paste, and audit assets.

    python3 tools/media.py image SRC --out DIR [--preset P | --widths 420,720] [options]
    python3 tools/media.py video SRC --out DIR [--widths 1920,1280,960] [options]
    python3 tools/media.py poster SRC --out DIR [--at SECONDS] [--width W]
    python3 tools/media.py snippet FILE... [--page HTML] [--portrait FILE]
    python3 tools/media.py info FILE...
    python3 tools/media.py audit [--json] [--strict] [--path DIR ...]
    python3 tools/media.py presets

Every write command takes --dry-run (print the ffmpeg commands, write nothing)
and --force (rebuild outputs that are already newer than the source). Outputs
are skipped when they are up to date, so re-running is safe.

The HTML snippet goes to stdout and the log goes to stderr, so
`... > snippet.html` captures only the markup. Snippet paths are relative to
--page when given (the HTML file you will paste into), else to the repo root.

House conventions this tool follows (see docs/recipes/media.md):
  images   <name>-<width>.webp, never upscaled, the suffix is the real width.
           WebP quality 75 (matches the committed next/assets/img set).
  video    <name>.webm full size, <name>-<w>.webm smaller sizes, <name>.mp4
           fallback (opaque clips only), <name>-poster.webp. Clips with alpha
           get an -alpha suffix on every webm and ship no mp4: browsers
           without VP9 alpha keep the poster, which keeps its alpha too.
           js/media-playback.js serves data-src-sm at <=720px, data-src-md
           above it, data-src when no variant is declared. Case-study clips
           declare their sizes as "clip_sizes" in content/projects/<slug>.json.

Needs ffmpeg and ffprobe on PATH (libwebp, libvpx-vp9, libx264). Python 3 stdlib only.
"""

import argparse
import json
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".tif", ".tiff", ".bmp"}
VIDEO_EXT = {".webm", ".mp4", ".mov", ".m4v", ".mkv"}
WEB_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"}

WEBP_QUALITY = 75        # q75 reproduces next/assets/img/*-420/-720.webp within a few KB
POSTER_QUALITY = 80
WEBM_CRF = 33            # VP9 constant quality; lower is bigger and sharper
MP4_CRF = 23             # x264 constant quality
POSTER_MAX_WIDTH = 1280  # the committed posters are 1280 wide for 1920 clips

# name: settings. Every value can be overridden on the command line.
PRESETS = {
    "gallery": dict(widths=[420, 720], aspect="4:5",
                    sizes="(max-width: 700px) 50vw, 20vw",
                    note="Studio photo strip, portrait 4:5 (next/assets/img/lighthouse-420/-720.webp)"),
    "card": dict(widths=[600, 1000],
                 sizes="(max-width: 700px) 90vw, 40vw",
                 note="Studio card image, source aspect (next/assets/img/balloon-600/-1000.webp)"),
    "lightbox": dict(widths=[512, 1280], labels=["thumb", "view"], aspect="4:5",
                     sizes="(max-width: 700px) 50vw, 25vw",
                     note="Photography gallery thumb + full view (assets/photos/beyond/gallery/*-thumb/-view.webp)"),
    "hero": dict(widths=[2400], aspect="16:9", no_suffix=True, eager=True,
                 note="Landscape hero poster, one file (next/assets/img/hero-land.webp)"),
    "hero-portrait": dict(widths=[1200], aspect="3:4", no_suffix=True, eager=True,
                          note="Portrait hero poster, one file (next/assets/img/hero-port.webp)"),
    "og": dict(widths=[1200], aspect="1200:630", fmt="png", no_suffix=True,
               note="Social share card 1200x630 PNG (assets/og/<page>-v1.png); bump -vN when it changes"),
}

# audit thresholds, in bytes
LIMITS = {
    "image": 300 * 1024,
    "poster": 120 * 1024,
    "video_full": 4 * 1024 * 1024,
    "video_variant": 2560 * 1024,
    "legacy_referenced": 150 * 1024,
}
AUDIT_DIRS = ["assets", "next/assets", "studies/*/assets"]
SKIP_DIRS = {".git", "node_modules", "vx", ".claude", "__pycache__"}
# files that can make a page load media; docs and this tool only mention names
TEXT_EXT = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".py", ".xml", ".webmanifest", ".sh"}
NOT_REFERENCES = ("docs", os.path.join("tools", "media.py"), os.path.join("tools", "media"))
FROZEN = ("studies",)    # design prototypes: findings there are info, not warnings
MIN_WIDTH_SUFFIX = 400   # -360 means a turntable, not a width; real width suffixes start at 420


# ------------------------------------------------------------------ helpers

class MediaError(Exception):
    pass


def log(msg):
    print(msg, file=sys.stderr)


def rel(path):
    try:
        r = os.path.relpath(path, ROOT)
    except ValueError:
        return path
    return path if r.startswith("..") else r


def kb(n):
    return "%d KB" % round(n / 1024) if n < 1024 * 1024 else "%.1f MB" % (n / 1048576)


def need_tools():
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise MediaError("%s not found on PATH (install ffmpeg)" % tool)


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "media"


def parse_widths(text):
    try:
        widths = [int(w) for w in str(text).split(",") if w.strip()]
    except ValueError:
        raise MediaError("--widths takes numbers separated by commas, got %r" % text)
    if not widths or min(widths) < 16:
        raise MediaError("--widths needs at least one width of 16 px or more")
    return sorted(set(widths))


def parse_aspect(text):
    if not text:
        return None
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*", text)
    if not m or float(m.group(2)) == 0:
        raise MediaError("--aspect takes W:H, for example 4:5 or 16:9, got %r" % text)
    return float(m.group(1)) / float(m.group(2))


def up_to_date(out, src, force):
    return (not force and os.path.exists(out) and os.path.getsize(out) > 0
            and os.path.getmtime(out) >= os.path.getmtime(src))


def run_ffmpeg(args, out, dry_run):
    """Run ffmpeg writing to a temp file, then move it into place (no half files)."""
    tmp = out + ".part"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + args + [tmp]
    shown = " ".join(shlex.quote(a) for a in cmd[:-1] + [out])
    if dry_run:
        log("  would run: " + shown)
        return
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0 or not os.path.exists(tmp):
        if os.path.exists(tmp):
            os.remove(tmp)
        raise MediaError("ffmpeg failed for %s:\n  %s\n%s" % (rel(out), shown, res.stderr.strip()))
    os.replace(tmp, out)


# --------------------------------------------------------- header readers

def image_header(path):
    """(width, height, has_alpha) from the file header for png/jpeg/webp/gif, else None."""
    try:
        with open(path, "rb") as f:
            head = f.read(64)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                w, h = struct.unpack(">II", head[16:24])
                ctype = head[25]
                alpha = ctype in (4, 6)
                if not alpha:
                    f.seek(8)
                    data = f.read(1 << 16)
                    alpha = b"tRNS" in data.split(b"IDAT")[0]
                return w, h, alpha
            if head[:6] in (b"GIF87a", b"GIF89a"):
                w, h = struct.unpack("<HH", head[6:10])
                return w, h, False
            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                chunk = head[12:16]
                if chunk == b"VP8 ":
                    w, h = struct.unpack("<HH", head[26:30])
                    return w & 0x3FFF, h & 0x3FFF, False
                if chunk == b"VP8L":
                    b = struct.unpack("<I", head[21:25])[0]
                    return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1, bool((b >> 28) & 1)
                if chunk == b"VP8X":
                    flags = head[20]
                    w = int.from_bytes(head[24:27], "little") + 1
                    h = int.from_bytes(head[27:30], "little") + 1
                    return w, h, bool(flags & 0x10)
                return None
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    m = f.read(2)
                    if len(m) < 2 or m[0] != 0xFF:
                        return None
                    marker = m[1]
                    if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                        continue
                    seglen = struct.unpack(">H", f.read(2))[0]
                    if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                        seg = f.read(5)
                        h, w = struct.unpack(">HH", seg[1:5])
                        return w, h, False
                    f.seek(seglen - 2, 1)
    except (OSError, struct.error):
        return None
    return None


def jpeg_orientation(path):
    """EXIF orientation 1..8 of a JPEG, 1 when absent.

    ffmpeg versions disagree on whether they apply it (6.1 does, older ones do not), so the
    image command passes -noautorotate and applies the rotation itself."""
    try:
        with open(path, "rb") as f:
            if f.read(2) != b"\xff\xd8":
                return 1
            while True:
                m = f.read(2)
                if len(m) < 2 or m[0] != 0xFF or m[1] in (0xDA, 0xD9):
                    return 1
                seglen = struct.unpack(">H", f.read(2))[0]
                data = f.read(seglen - 2)
                if m[1] == 0xE1 and data[:6] == b"Exif\x00\x00":
                    t = data[6:]
                    end = "<" if t[:2] == b"II" else ">"
                    ifd = struct.unpack(end + "I", t[4:8])[0]
                    count = struct.unpack(end + "H", t[ifd:ifd + 2])[0]
                    for i in range(count):
                        e = t[ifd + 2 + 12 * i: ifd + 14 + 12 * i]
                        if struct.unpack(end + "H", e[:2])[0] == 0x0112:
                            v = struct.unpack(end + "H", e[8:10])[0]
                            return v if 1 <= v <= 8 else 1
                    return 1
    except (OSError, struct.error):
        return 1


ORIENT_FILTERS = {2: "hflip", 3: "hflip,vflip", 4: "vflip", 5: "transpose=0",
                  6: "transpose=1", 7: "transpose=3", 8: "transpose=2"}


def probe(path):
    """Stream facts from ffprobe: width, height, codec, alpha, duration, fps, bytes."""
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
           "stream=codec_name,width,height,pix_fmt,r_frame_rate:stream_tags=alpha_mode:format=duration,bit_rate",
           "-of", "json", path]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise MediaError("ffprobe cannot read %s: %s" % (path, res.stderr.strip()))
    data = json.loads(res.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise MediaError("%s has no video or image stream" % path)
    s = streams[0]
    fmt = data.get("format") or {}
    pix = s.get("pix_fmt") or ""
    tags = s.get("tags") or {}
    alpha = (str(tags.get("alpha_mode", tags.get("ALPHA_MODE", ""))) == "1"
             or pix.startswith(("yuva", "rgba", "bgra", "argb", "abgr", "gbrap", "ya", "pal8")))
    num, _, den = (s.get("r_frame_rate") or "0/1").partition("/")
    try:
        fps = float(num) / float(den or 1)
    except (ValueError, ZeroDivisionError):
        fps = 0.0
    return {
        "width": int(s.get("width") or 0), "height": int(s.get("height") or 0),
        "codec": s.get("codec_name") or "", "pix_fmt": pix, "alpha": alpha,
        "duration": float(fmt.get("duration") or 0), "fps": round(fps, 3),
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "bytes": os.path.getsize(path) if os.path.exists(path) else 0,
    }


def decoder_args(info):
    """VP8/VP9 alpha lives in side data that only libvpx decodes; the native decoder drops it."""
    if info["codec"] == "vp9" and info["alpha"]:
        return ["-c:v", "libvpx-vp9"]
    if info["codec"] == "vp8" and info["alpha"]:
        return ["-c:v", "libvpx"]
    return []


def source_facts(src):
    if "%" in os.path.basename(src):  # image sequence like frames/%04d.png
        first = src % 1 if os.path.exists(src % 1) else src % 0
        if not os.path.exists(first):
            raise MediaError("no frames match %s (looked for %s)" % (src, first))
        info = probe(first)
        info["sequence"] = True
        return info
    if not os.path.exists(src):
        raise MediaError("source not found: %s" % src)
    info = probe(src)
    info["sequence"] = False
    return info


# ----------------------------------------------------------------- snippets

def href(path, page):
    """Path as written in HTML: relative to the page's folder, else to the repo root."""
    path = os.path.abspath(path)
    if not page and os.path.relpath(path, ROOT).startswith(".."):
        return path  # outside the repo and no page given: show where it is
    base = os.path.dirname(os.path.abspath(page)) if page else ROOT
    return os.path.relpath(path, base).replace(os.sep, "/")


def esc(text):
    return (text or "").replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def img_snippet(files, page=None, sizes=None, alt="", eager=False, portrait=None):
    """files: list of (path, width, height) smallest first."""
    files = sorted(files, key=lambda f: f[1])
    big = files[-1]
    attrs = ['src="%s"' % href(files[0][0] if len(files) > 1 else big[0], page)]
    if len(files) > 1:
        attrs.append('srcset="%s"' % ", ".join("%s %dw" % (href(p, page), w) for p, w, _ in files))
        attrs.append('sizes="%s"' % esc(sizes or "100vw"))
    attrs.append('alt="%s"' % esc(alt))
    attrs.append('fetchpriority="high"' if eager else 'loading="lazy" decoding="async"')
    attrs.append('width="%d" height="%d"' % (big[1], big[2]))
    img = "<img %s>" % " ".join(attrs)
    if not portrait:
        return img
    return ('<picture>\n  <source media="(max-aspect-ratio: 1/1)" srcset="%s">\n  %s\n</picture>'
            % (href(portrait, page), img))


def video_snippet(full, md, sm, mp4, poster, page=None, alt="", alpha=False, cover=False):
    """Markup in the js/media-playback.js contract (lazy sources, lazy poster)."""
    lines = []
    label = ' aria-label="%s"' % esc(alt) if alt else ""
    fit = "cover" if cover else "contain"
    lines.append('<video data-clip="1" data-poster="%s" loop muted playsinline preload="none"%s '
                 'style="width: 100%%; height: 100%%; object-fit: %s; display: block">'
                 % (href(poster, page), label, fit))
    src = 'data-src="%s"' % href(full, page)
    if md:
        src += ' data-src-md="%s"' % href(md, page)
    if sm:
        src += ' data-src-sm="%s"' % href(sm, page)
    lines.append('  <source %s type="video/webm">' % src)
    if mp4:
        lines.append('  <source data-src="%s" type="video/mp4">' % href(mp4, page))
    lines.append("</video>")
    note = ("<!-- alpha clip: no mp4 on purpose; browsers without VP9 alpha keep the poster -->\n"
            if alpha else "")
    return note + "\n".join(lines)


# -------------------------------------------------------------------- image

def cmd_image(a):
    need_tools()
    src = os.path.abspath(a.src)
    if not os.path.isfile(src):
        raise MediaError("source not found: %s" % a.src)
    preset = dict(PRESETS.get(a.preset, {})) if a.preset else {}
    if a.preset and a.preset not in PRESETS:
        raise MediaError("unknown preset %r; run `media.py presets`" % a.preset)
    widths = parse_widths(a.widths) if a.widths else preset.get("widths")
    if not widths:
        raise MediaError("give --preset or --widths (run `media.py presets` for the list)")
    labels = a.labels.split(",") if a.labels else preset.get("labels")
    if labels and len(labels) != len(widths):
        raise MediaError("--labels needs one label per width (%d widths)" % len(widths))
    aspect = parse_aspect(a.aspect if a.aspect is not None else preset.get("aspect"))
    fmt = (a.format or preset.get("fmt") or "webp").lower().replace("jpeg", "jpg")
    if fmt not in ("webp", "png", "jpg"):
        raise MediaError("--format is webp, png or jpg")
    no_suffix = a.no_suffix or preset.get("no_suffix", False)
    if no_suffix and len(widths) > 1:
        raise MediaError("--no-suffix only works with a single width")
    sizes = a.sizes or preset.get("sizes")
    eager = a.eager or preset.get("eager", False)
    quality = a.quality if a.quality is not None else WEBP_QUALITY
    name = a.name or slug(os.path.splitext(os.path.basename(src))[0])
    out_dir = os.path.abspath(a.out)

    info = probe(src)
    w0, h0 = info["width"], info["height"]
    orient = jpeg_orientation(src) if src.lower().endswith((".jpg", ".jpeg")) else 1
    pre = [ORIENT_FILTERS[orient]] if orient in ORIENT_FILTERS else []
    if orient >= 5:
        w0, h0 = h0, w0
    alpha = info["alpha"]

    # crop to the aspect first, around --gravity
    cw, ch = w0, h0
    if aspect:
        if w0 / h0 > aspect:
            cw = int(round(h0 * aspect))
        else:
            ch = int(round(w0 / aspect))
        gx = {"left": "0", "right": "in_w-out_w"}.get(a.gravity, "(in_w-out_w)/2")
        gy = {"top": "0", "bottom": "in_h-out_h"}.get(a.gravity, "(in_h-out_h)/2")
        if (cw, ch) != (w0, h0):
            pre.append("crop=%d:%d:%s:%s" % (cw, ch, gx, gy))

    log("image %s  %dx%d%s -> %s/" % (rel(src), w0, h0, " alpha" if alpha else "", rel(out_dir)))
    made = []
    plan = list(zip(widths, labels or [None] * len(widths)))
    skipped = [w for w, _ in plan if w > cw]
    plan = [(w, l) for w, l in plan if w <= cw]
    if skipped:
        log("  note: source crop is %d px wide; not upscaling to %s" % (cw, ", ".join(map(str, skipped))))
        if not plan:  # keep one file at the real width so the set is never empty
            plan = [(cw, (labels or [None])[-1])]
    for w, label in plan:
        h = int(round(w * ch / cw))  # images may be odd-sized; only video needs even
        suffix = "" if no_suffix else "-" + (label or str(w))
        out = os.path.join(out_dir, "%s%s.%s" % (name, suffix, fmt))
        chain = pre + ["scale=%d:%d:flags=lanczos" % (w, h)]
        if fmt == "webp":
            chain.append("format=yuva420p" if alpha else "format=yuv420p")
            codec = ["-c:v", "libwebp", "-quality", str(quality), "-compression_level", "6",
                     "-preset", a.webp_preset, "-f", "webp"]
        elif fmt == "png":
            chain.append("format=rgba" if alpha else "format=rgb24")
            codec = ["-c:v", "png", "-f", "image2", "-update", "1"]
        else:
            chain.append("format=yuvj420p")
            qv = max(2, min(31, int(round(31 - quality * 0.29))))
            codec = ["-c:v", "mjpeg", "-q:v", str(qv), "-f", "image2", "-update", "1"]
        if up_to_date(out, src, a.force):
            log("  up to date  %s" % rel(out))
        else:
            run_ffmpeg(["-noautorotate", "-i", src, "-frames:v", "1", "-vf", ",".join(chain), "-map_metadata", "-1"]
                       + codec, out, a.dry_run)
            if not a.dry_run:
                log("  wrote       %s  %dx%d  %s" % (rel(out), w, h, kb(os.path.getsize(out))))
        made.append((out, w, h))
    print(img_snippet(made, a.page, sizes, a.alt or "", eager))
    return 0


# -------------------------------------------------------------------- video

def cmd_video(a):
    need_tools()
    src = a.src if "%" in os.path.basename(a.src) else os.path.abspath(a.src)
    info = source_facts(src)
    alpha = info["alpha"] and not a.opaque
    if a.alpha and not info["alpha"]:
        raise MediaError("--alpha given but the source has no alpha channel (%s %s)"
                         % (info["codec"], info["pix_fmt"]))
    name = a.name or slug(re.sub(r"-alpha$", "", os.path.splitext(os.path.basename(src))[0].replace("%", "")))
    out_dir = os.path.abspath(a.out)
    sw = info["width"]
    widths = parse_widths(a.widths) if a.widths else [1920, 1280, 960]
    full_w = min(max(widths), sw)
    variants = [w for w in sorted(widths, reverse=True) if w < full_w][:2]
    if max(widths) > sw:
        log("  note: source is %d px wide; the full file stays at %d (no upscaling)" % (sw, full_w))
    sfx = "-alpha" if alpha else ""
    want_mp4 = (not alpha and not a.no_mp4) or (alpha and a.mp4_bg)
    if info["sequence"]:
        fps = a.fps or 30  # a still frame reports 25 fps; sequences are rendered at 30
    else:
        fps = a.fps or (info["fps"] if 0 < info["fps"] <= 60 else 30)

    log("video %s  %dx%d %s%s %.1fs %gfps -> %s/" % (
        src if info["sequence"] else rel(src), sw, info["height"], info["codec"],
        " alpha" if info["alpha"] else "", info["duration"], fps, rel(out_dir)))

    inp = decoder_args(info)
    if info["sequence"]:
        inp += ["-framerate", str(fps)]
    if a.start:
        inp += ["-ss", str(a.start)]
    inp += ["-i", src]
    if a.duration:
        inp += ["-t", str(a.duration)]
    stamp_src = src if not info["sequence"] else (src % 1 if os.path.exists(src % 1) else src % 0)

    def scale(w):
        return "scale=%d:-2:flags=lanczos" % w

    outputs = {}
    sizes = [("full", full_w)] + [("v%d" % i, w) for i, w in enumerate(variants)]
    for key, w in sizes:
        out = os.path.join(out_dir, "%s%s%s.webm" % (name, "" if key == "full" else "-%d" % w, sfx))
        outputs[key] = out
        vf = [scale(w), "fps=%g" % fps, "format=yuva420p" if alpha else "format=yuv420p"]
        args = inp + ["-an", "-vf", ",".join(vf), "-c:v", "libvpx-vp9", "-b:v", "0",
                      "-crf", str(a.crf), "-deadline", "good", "-cpu-used", str(a.speed),
                      "-row-mt", "1", "-threads", str(a.threads), "-g", str(int(fps * 8)),
                      "-map_metadata", "-1"]
        if alpha:  # libvpx cannot use alt-ref frames with an alpha plane
            args += ["-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1"]
        args += ["-f", "webm"]
        if up_to_date(out, stamp_src, a.force):
            log("  up to date  %s" % rel(out))
        else:
            run_ffmpeg(args, out, a.dry_run)
            if not a.dry_run:
                log("  wrote       %s  %dpx  %s" % (rel(out), w, kb(os.path.getsize(out))))

    mp4 = None
    if want_mp4:
        mp4 = os.path.join(out_dir, "%s.mp4" % name)
        if alpha:  # flatten onto a solid colour for the opaque fallback
            vf = ("color=c=%s:s=16x16:r=%g,format=yuv420p[bg];[0:v]%s,fps=%g[fg];[bg][fg]scale2ref[bg2][fg2];"
                  "[bg2][fg2]overlay=shortest=1,format=yuv420p" % (a.mp4_bg, fps, scale(full_w), fps))
            filt = ["-filter_complex", vf]
        else:
            filt = ["-vf", "%s,fps=%g,format=yuv420p" % (scale(full_w), fps)]
        args = inp + ["-an"] + filt + ["-c:v", "libx264", "-preset", "slow", "-crf", str(a.mp4_crf),
                                       "-profile:v", "high", "-movflags", "+faststart",
                                       "-threads", str(a.threads), "-map_metadata", "-1", "-f", "mp4"]
        if up_to_date(mp4, stamp_src, a.force):
            log("  up to date  %s" % rel(mp4))
        else:
            run_ffmpeg(args, mp4, a.dry_run)
            if not a.dry_run:
                log("  wrote       %s  %dpx  %s" % (rel(mp4), full_w, kb(os.path.getsize(mp4))))

    poster = os.path.join(out_dir, "%s-poster.webp" % name)
    make_poster(src, info, poster, a.poster_at if a.poster_at is not None else (a.start or 0),
                min(full_w, a.poster_width or POSTER_MAX_WIDTH), alpha, a.force, a.dry_run, stamp_src, fps)

    if len(variants) == 2:
        md, sm = outputs["v0"], outputs["v1"]
    elif len(variants) == 1:  # one smaller size: phones get it, desktops get the full file
        md, sm = None, outputs["v0"]
    else:
        md = sm = None
    print(video_snippet(outputs["full"], md, sm, mp4, poster, a.page, a.alt or "", alpha, a.cover))
    if len(variants) == 2 and alpha:
        log("  case study clip: set \"clip_sizes\": [%s] in content/projects/<slug>.json, then"
            " python3 tools/build.py, so the page gets the -md/-sm sources" % ", ".join(str(w) for w in variants))
    return 0


def make_poster(src, info, out, at, width, alpha, force, dry_run, stamp_src=None, fps=30):
    inp = decoder_args(info)
    if info.get("sequence"):
        inp += ["-framerate", "%g" % fps]
        frame = int(float(at or 0) * fps)
        vf = ["select=eq(n\\,%d)" % frame]
        args = inp + ["-i", src]
    else:
        args = inp + (["-ss", str(at)] if float(at or 0) > 0 else []) + ["-i", src]
        vf = []
    vf += ["scale=%d:-2:flags=lanczos" % width, "format=yuva420p" if alpha else "format=yuv420p"]
    args += ["-frames:v", "1", "-vf", ",".join(vf), "-an", "-map_metadata", "-1",
             "-c:v", "libwebp", "-quality", str(POSTER_QUALITY), "-compression_level", "6", "-f", "webp"]
    if up_to_date(out, stamp_src or src, force):
        log("  up to date  %s" % rel(out))
        return
    run_ffmpeg(args, out, dry_run)
    if not dry_run:
        log("  wrote       %s  %dpx%s  %s" % (rel(out), width, " alpha" if alpha else "", kb(os.path.getsize(out))))


def cmd_poster(a):
    need_tools()
    src = a.src if "%" in os.path.basename(a.src) else os.path.abspath(a.src)
    info = source_facts(src)
    name = a.name or slug(re.sub(r"-(\d{3,4})?-?alpha$|-\d{3,4}$", "",
                                 os.path.splitext(os.path.basename(src))[0].replace("%", "")))
    out = os.path.join(os.path.abspath(a.out), "%s-poster.webp" % name)
    width = min(info["width"], a.width or POSTER_MAX_WIDTH)
    alpha = info["alpha"] and not a.opaque
    log("poster %s at %ss -> %s" % (rel(src), a.at, rel(out)))
    stamp = src if not info["sequence"] else (src % 1 if os.path.exists(src % 1) else src % 0)
    make_poster(src, info, out, a.at, width, alpha, a.force, a.dry_run, stamp)
    print('poster="%s"  (or data-poster="..." for a lazy poster)' % href(out, a.page))
    return 0


# ------------------------------------------------------------ snippet, info

def dims(path):
    hdr = image_header(path)
    if hdr:
        return hdr
    info = probe(path)
    return info["width"], info["height"], info["alpha"]


def cmd_snippet(a):
    files = []
    for f in a.files:
        if not os.path.isfile(f):
            raise MediaError("not found: %s" % f)
        w, h, _ = dims(f)
        files.append((os.path.abspath(f), w, h))
    if a.portrait and not os.path.isfile(a.portrait):
        raise MediaError("not found: %s" % a.portrait)
    print(img_snippet(files, a.page, a.sizes, a.alt or "", a.eager, a.portrait))
    return 0


def cmd_info(a):
    rows = []
    for f in a.files:
        if not os.path.isfile(f):
            raise MediaError("not found: %s" % f)
        ext = os.path.splitext(f)[1].lower()
        hdr = image_header(f) if ext in IMAGE_EXT else None
        if hdr:
            row = {"file": rel(os.path.abspath(f)), "width": hdr[0], "height": hdr[1], "alpha": hdr[2],
                   "bytes": os.path.getsize(f)}
        else:
            need_tools()
            p = probe(f)
            row = {"file": rel(os.path.abspath(f)), **p}
        rows.append(row)
    if a.json:
        print(json.dumps(rows, indent=2))
        return 0
    for r in rows:
        extra = ""
        if "codec" in r and r.get("duration"):
            extra = "  %s %.1fs %gfps %d kbps" % (r["codec"], r["duration"], r["fps"], r["bit_rate"] // 1000)
        print("%-60s %5dx%-5d %-6s %8s%s" % (r["file"], r["width"], r["height"],
                                            "alpha" if r["alpha"] else "", kb(r["bytes"]), extra))
    return 0


def cmd_presets(a):
    print("%-14s %-22s %-9s %-6s %s" % ("preset", "widths", "aspect", "format", "used for"))
    for k, p in PRESETS.items():
        ws = ",".join(p.get("labels") and ["%d(%s)" % x for x in zip(p["widths"], p["labels"])]
                      or map(str, p["widths"]))
        print("%-14s %-22s %-9s %-6s %s" % (k, ws, p.get("aspect", "source"), p.get("fmt", "webp"), p["note"]))
    return 0


# -------------------------------------------------------------------- audit

def walk_text_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            if os.path.splitext(fn)[1].lower() in TEXT_EXT and not rel(path).startswith(NOT_REFERENCES):
                yield path


TEMPLATE_REF = re.compile(r"[\w./-]*\$\{[^}]+\}[\w./${}-]*\.(?:webp|jpe?g|png|gif|avif|svg|webm|mp4)")


def template_patterns(corpus):
    """`assets/x/${p.file}-view.webp` in JS -> a regex that matches the files it can load."""
    pats = set()
    for m in TEMPLATE_REF.finditer(corpus):
        parts = re.split(r"\$\{[^}]+\}", m.group(0))
        parts[0] = re.sub(r"^(\.\.?/|/)+", "", parts[0])
        if "/" not in parts[0]:
            continue  # `${a}-${b}.png` names nothing specific enough to count
        pats.add("(?:^|/)" + "[^/]*".join(re.escape(x) for x in parts) + "$")
    return [re.compile(p) for p in pats]


def width_claim(fn):
    """The width a file name claims (robo-catcher-1400.webp -> 1400), or None."""
    m = re.search(r"-(\d{3,4})(?:-alpha)?\.\w+$", fn)
    return int(m.group(1)) if m and int(m.group(1)) >= MIN_WIDTH_SUFFIX else None


REF_ATTR = re.compile(r'''(?:\s(?:src|poster|data-src(?:-md|-sm)?|data-poster|href)\s*=\s*["']([^"']+)["'])'''
                      r'''|(?:srcset\s*=\s*["']([^"']+)["'])'''
                      r'''|(?:url\(\s*["']?([^"')]+)["']?\s*\))''')
MEDIA_REF_EXT = WEB_IMAGE_EXT | VIDEO_EXT


def html_media_refs(path, text):
    """(ref, resolved_path, srcset_width or None) for media references in an html/css file."""
    base = os.path.dirname(path)
    for m in REF_ATTR.finditer(text):
        if m.group(2):
            parts = [p.strip().split() for p in m.group(2).split(",") if p.strip()]
            items = [(p[0], int(p[1][:-1]) if len(p) > 1 and re.fullmatch(r"\d+w", p[1]) else None)
                     for p in parts if p]
        else:
            items = [(m.group(1) or m.group(3), None)]
        for ref, w in items:
            ref = ref.strip()
            clean = ref.split("#")[0].split("?")[0]
            if (not clean or re.match(r"^[a-z]+:", clean) or clean.startswith("//")
                    or "${" in clean or "{{" in clean or "+" in clean):
                continue
            if os.path.splitext(clean)[1].lower() not in MEDIA_REF_EXT:
                continue
            target = os.path.join(ROOT, clean.lstrip("/")) if clean.startswith("/") else os.path.join(base, clean)
            yield ref, os.path.normpath(target), w


def audit_files(paths):
    import glob
    roots = []
    for p in paths:
        roots += sorted(glob.glob(os.path.join(ROOT, p)))
    files = []
    for r in roots:
        for dirpath, dirnames, filenames in os.walk(r):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                ext = os.path.splitext(fn)[1].lower()
                if ext in IMAGE_EXT or ext in VIDEO_EXT:
                    files.append(os.path.join(dirpath, fn))
    return sorted(set(files))


def family(fn):
    """robo-catcher-360-1280-alpha.webm -> robo-catcher-360; x-poster.webp -> x."""
    stem = os.path.splitext(fn)[0]
    stem = re.sub(r"-poster$", "", stem)
    stem = re.sub(r"-alpha$", "", stem)
    if width_claim(fn):
        stem = re.sub(r"-\d{3,4}$", "", stem)
    return stem


def cmd_audit(a):
    files = audit_files(a.path or AUDIT_DIRS)
    if not files:
        raise MediaError("no media files under %s" % ", ".join(a.path or AUDIT_DIRS))
    have_ffprobe = bool(shutil.which("ffprobe"))
    facts = {}
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        hdr = image_header(f) if ext in IMAGE_EXT else None
        if hdr:
            facts[f] = {"width": hdr[0], "height": hdr[1], "alpha": hdr[2], "bytes": os.path.getsize(f), "kind": "image"}
        elif ext in VIDEO_EXT and have_ffprobe:
            try:
                facts[f] = {**probe(f), "kind": "video"}
            except MediaError:
                facts[f] = {"width": 0, "height": 0, "alpha": False, "bytes": os.path.getsize(f), "kind": "video"}
        else:
            facts[f] = {"width": 0, "height": 0, "alpha": False, "bytes": os.path.getsize(f),
                        "kind": "video" if ext in VIDEO_EXT else "image"}

    corpus, refs = [], []
    for t in walk_text_files():
        try:
            text = open(t, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        corpus.append(text)
        if t.endswith((".html", ".htm", ".css")):
            refs.extend((t, ref, target, w) for ref, target, w in html_media_refs(t, text))
    corpus = "\n".join(corpus)
    templates = template_patterns(corpus)

    def referenced(path):
        if os.path.basename(path) in corpus:
            return True
        r = rel(path).replace(os.sep, "/")
        return any(t.search(r) for t in templates)

    def never_served(path):
        """Every reference is data-src next to a data-src-md, which media-playback.js always prefers."""
        fn = os.path.basename(path)
        total = len(re.findall(re.escape(fn) + r"\b", corpus))
        with_md = len(re.findall(re.escape(fn) + r"[\"']\s+data-src-md=", corpus))
        return total > 0 and total == with_md

    issues = []

    def add(level, check, path, msg):
        if level == "warn" and rel(path).startswith(FROZEN):
            level, msg = "info", msg + " (frozen study)"
        elif level == "warn" and check == "oversized" and not referenced(path):
            level, msg = "info", msg + " (no page loads it)"
        elif level == "warn" and check == "oversized" and never_served(path):
            level, msg = "info", msg + " (never fetched, see never-served)"
        issues.append({"level": level, "check": check, "file": rel(path), "message": msg})

    by_dir = {}
    for f in files:
        by_dir.setdefault(os.path.dirname(f), []).append(os.path.basename(f))

    for f in files:
        x = facts[f]
        fn = os.path.basename(f)
        ext = os.path.splitext(fn)[1].lower()
        poster = "-poster." in fn
        # 1 size
        if x["kind"] == "image":
            lim = LIMITS["poster"] if poster else LIMITS["image"]
            if x["bytes"] > lim:
                add("warn", "oversized", f, "%s, limit %s%s" % (kb(x["bytes"]), kb(lim),
                    "" if ext == ".webp" else "; a WebP at q75 is usually 3-5x smaller"))
        else:
            variant = width_claim(fn) is not None
            lim = LIMITS["video_variant"] if variant else LIMITS["video_full"]
            if x["bytes"] > lim:
                br = " (%d kbps)" % (x.get("bit_rate", 0) // 1000) if x.get("bit_rate") else ""
                add("warn", "oversized", f, "%s%s, limit %s; re-encode with a higher --crf or fewer pixels"
                    % (kb(x["bytes"]), br, kb(lim)))
        # 2 suffix tells the truth
        claim = width_claim(fn)
        if claim and x["width"] and claim not in (x["width"], x["height"]):
            add("warn", "suffix-mismatch", f, "name says %d but the file is %dx%d"
                % (claim, x["width"], x["height"]))
        # 3 legacy formats that pages load
        if ext in (".jpg", ".jpeg", ".png") and x["bytes"] > LIMITS["legacy_referenced"]:
            stem = os.path.splitext(fn)[0]
            sib = any(s.startswith(stem) and s.endswith(".webp") for s in by_dir[os.path.dirname(f)])
            if referenced(f) and not sib and "/og/" not in f.replace(os.sep, "/"):
                add("warn", "no-webp", f, "%s %s is loaded by a page and has no WebP sibling; "
                    "run `media.py image` on it" % (kb(x["bytes"]), ext[1:].upper()))
        # 4 unreferenced
        if not referenced(f):
            add("info", "unreferenced", f, "no html/css/js/json/py file names it")
        # 5 very large pixel sizes
        if x["kind"] == "image" and x["width"] > 2560:
            add("info", "huge-pixels", f, "%dx%d; 2560 is the widest any layout shows" % (x["width"], x["height"]))

    # video families: posters and size variants
    fams = {}
    for f in files:
        if os.path.splitext(f)[1].lower() in VIDEO_EXT:
            fams.setdefault((os.path.dirname(f), family(os.path.basename(f))), []).append(f)
    for (d, fam), members in sorted(fams.items()):
        names = by_dir[d]
        if not any(n.startswith(fam + "-poster.") for n in names):
            add("warn", "no-poster", members[0], "video family %s has no %s-poster.webp" % (fam, fam))
        fulls = [f for f in members if not width_claim(os.path.basename(f))]
        smalls = [f for f in members if f not in fulls]
        for full in fulls:
            w = facts[full]["width"]
            if full.endswith(".webm") and w > 1280 and not smalls:
                add("warn", "no-variants", full, "%d px wide with no smaller sizes; "
                    "`media.py video` writes -1280 and -960 for media-playback.js" % w)
            if never_served(full):
                add("info", "never-served", full, "%s; every <source> also declares data-src-md, which "
                    "js/media-playback.js always prefers, so browsers never fetch this file" % kb(facts[full]["bytes"]))
            if full.endswith(".mp4") and not any(m.endswith(".webm") for m in members) and w > 1280:
                add("info", "mp4-only", full, "%d px mp4 with no webm; VP9 is usually 30-50%% smaller" % w)

    # html references: missing files, wrong srcset widths, wrong width/height attributes
    seen = set()
    for page, ref, target, w in refs:
        key = (page, ref)
        if key in seen:
            continue
        seen.add(key)
        if not os.path.exists(target):
            if page.startswith(os.path.join(ROOT, "src")):
                continue  # templates resolve against the built page, not src/
            add("warn", "missing-file", page, "references %s, which does not exist" % ref)
            continue
        if w:
            real = facts.get(target, {}).get("width") or (image_header(target) or (0,))[0]
            if real and real != w:
                add("warn", "srcset-width", page, "%s is declared %dw but is %d px wide" % (ref, w, real))

    order = {"warn": 0, "info": 1}
    issues.sort(key=lambda i: (order[i["level"]], i["check"], i["file"], i["message"]))
    total = sum(facts[f]["bytes"] for f in files)
    if a.json:
        print(json.dumps({"files": len(files), "bytes": total, "issues": issues}, indent=2))
    else:
        print("media audit: %d files, %s, under %s" % (len(files), kb(total), ", ".join(a.path or AUDIT_DIRS)))
        if not have_ffprobe:
            print("(ffprobe not found: video sizes in pixels were not checked)")
        counts = {}
        for i in issues:
            counts[(i["level"], i["check"])] = counts.get((i["level"], i["check"]), 0) + 1
        print("\n%-5s %-16s %s" % ("level", "check", "count"))
        for (lvl, chk), n in sorted(counts.items(), key=lambda kv: (order[kv[0][0]], kv[0][1])):
            print("%-5s %-16s %d" % (lvl, chk, n))
        shown_levels = ("warn", "info") if a.verbose else ("warn",)
        cur = None
        for i in issues:
            if i["level"] not in shown_levels:
                continue
            if i["check"] != cur:
                cur = i["check"]
                print("\n[%s] %s" % (i["level"], cur))
            print("  %s: %s" % (i["file"], i["message"]))
        if not a.verbose and any(i["level"] == "info" for i in issues):
            print("\n(info items hidden; add --verbose to list them)")
    warns = sum(1 for i in issues if i["level"] == "warn")
    return 1 if (a.strict and warns) else 0


# --------------------------------------------------------------------- main

def build_parser():
    p = argparse.ArgumentParser(prog="media.py", description=__doc__.split("\n\n")[0].strip(),
                                formatter_class=argparse.RawDescriptionHelpFormatter,
                                epilog="Recipes: docs/recipes/media.md. Run `media.py <command> -h` for options.")
    sub = p.add_subparsers(dest="cmd", metavar="command")

    def common_write(sp):
        sp.add_argument("--out", required=True, help="folder for the outputs, e.g. next/assets/img")
        sp.add_argument("--name", help="base file name (default: slug of the source name)")
        sp.add_argument("--page", help="HTML file you will paste into; snippet paths become relative to it")
        sp.add_argument("--alt", help="alt text (image) or aria-label (video) for the snippet")
        sp.add_argument("--dry-run", action="store_true", help="print the ffmpeg commands, write nothing")
        sp.add_argument("--force", action="store_true", help="rebuild even when outputs are up to date")

    s = sub.add_parser("image", help="source image -> resized WebP set + <img srcset> snippet",
                       formatter_class=argparse.RawDescriptionHelpFormatter,
                       description="Resize (never upscale), crop to an aspect, encode, and print the <img> to paste.\n"
                                   "Example:\n  python3 tools/media.py image ~/Downloads/dunes.jpg --preset gallery "
                                   "--name dunes --out next/assets/img --page next/index.html --alt \"Dunes at dusk\"")
    s.add_argument("src", help="source image (jpg, png, webp, tif ...)")
    common_write(s)
    s.add_argument("--preset", help="named size set: %s (see `media.py presets`)" % ", ".join(PRESETS))
    s.add_argument("--widths", help="comma list of output widths, e.g. 420,720 (overrides the preset)")
    s.add_argument("--labels", help="suffixes instead of widths, one per width, e.g. thumb,view")
    s.add_argument("--aspect", help="center-crop to W:H first, e.g. 4:5, 16:9 (use '' to keep the source aspect)")
    s.add_argument("--gravity", default="center", choices=["center", "top", "bottom", "left", "right"],
                   help="which part to keep when cropping (default center)")
    s.add_argument("--format", help="webp (default), png or jpg")
    s.add_argument("--quality", type=int, help="encoder quality 0-100 (default %d)" % WEBP_QUALITY)
    s.add_argument("--webp-preset", default="photo", choices=["photo", "picture", "drawing", "icon", "text", "default"],
                   help="libwebp tuning (default photo; use drawing for flat graphics)")
    s.add_argument("--no-suffix", action="store_true", help="single width: write <name>.<ext> without -<width>")
    s.add_argument("--sizes", help='the <img sizes> value, e.g. "(max-width: 700px) 90vw, 40vw"')
    s.add_argument("--eager", action="store_true", help="above-the-fold image: fetchpriority=high, no lazy loading")
    s.set_defaults(fn=cmd_image)

    v = sub.add_parser("video", help="source clip -> VP9 webm sizes (+ mp4) + poster + <video> snippet",
                       formatter_class=argparse.RawDescriptionHelpFormatter,
                       description="Encode a clip in the site's video convention and print the <video> to paste.\n"
                                   "Alpha is detected (VP9/VP8 alpha webm, ProRes 4444, PNG sequences).\n"
                                   "Examples:\n"
                                   "  python3 tools/media.py video render.mov --name hotbox-360 --out assets/motion --page index.html\n"
                                   "  python3 tools/media.py video 'frames/%%04d.png' --fps 30 --name kaan-360 --out assets/motion")
    v.add_argument("src", help="source clip, or an image sequence pattern like frames/%%04d.png")
    common_write(v)
    v.add_argument("--widths", help="largest is the full file, the next two become -md/-sm (default 1920,1280,960)")
    v.add_argument("--alpha", action="store_true", help="require alpha (error if the source has none)")
    v.add_argument("--opaque", action="store_true", help="ignore the source alpha and encode opaque")
    v.add_argument("--no-mp4", action="store_true", help="skip the H.264 fallback for an opaque clip")
    v.add_argument("--mp4-bg", metavar="COLOR", help="alpha clip: also write an mp4 flattened onto COLOR, e.g. white")
    v.add_argument("--crf", type=int, default=WEBM_CRF, help="VP9 quality, lower is bigger (default %d)" % WEBM_CRF)
    v.add_argument("--mp4-crf", type=int, default=MP4_CRF, help="x264 quality (default %d)" % MP4_CRF)
    v.add_argument("--fps", type=float, help="output frame rate (default: source, 30 for sequences)")
    v.add_argument("--start", type=float, help="trim: start at this second")
    v.add_argument("--duration", type=float, help="trim: keep this many seconds")
    v.add_argument("--poster-at", type=float, help="poster frame time in seconds (default: --start or 0)")
    v.add_argument("--poster-width", type=int, help="poster width (default min(full, %d))" % POSTER_MAX_WIDTH)
    v.add_argument("--cover", action="store_true", help="snippet uses object-fit: cover (default contain)")
    v.add_argument("--speed", type=int, default=2, help="libvpx -cpu-used 0-5, higher is faster and softer (default 2)")
    v.add_argument("--threads", type=int, default=2, help="encoder threads (default 2; the box is shared)")
    v.set_defaults(fn=cmd_video)

    po = sub.add_parser("poster", help="one frame of a clip -> <name>-poster.webp (keeps alpha)")
    po.add_argument("src", help="clip or image sequence pattern")
    po.add_argument("--out", required=True, help="output folder")
    po.add_argument("--name", help="base name; writes <name>-poster.webp (default: clip family name)")
    po.add_argument("--at", type=float, default=0, help="frame time in seconds (default 0)")
    po.add_argument("--width", type=int, help="poster width (default min(source, %d))" % POSTER_MAX_WIDTH)
    po.add_argument("--opaque", action="store_true", help="drop the alpha channel")
    po.add_argument("--page", help="HTML file for the printed path")
    po.add_argument("--dry-run", action="store_true")
    po.add_argument("--force", action="store_true")
    po.set_defaults(fn=cmd_poster)

    sn = sub.add_parser("snippet", help="print the <img> (or <picture>) for files that already exist")
    sn.add_argument("files", nargs="+", help="one or more widths of the same image")
    sn.add_argument("--page", help="HTML file you will paste into")
    sn.add_argument("--sizes", help="the <img sizes> value")
    sn.add_argument("--alt", help="alt text")
    sn.add_argument("--eager", action="store_true", help="fetchpriority=high, no lazy loading")
    sn.add_argument("--portrait", help="art-directed portrait file for (max-aspect-ratio: 1/1)")
    sn.set_defaults(fn=cmd_snippet)

    i = sub.add_parser("info", help="size, pixels, alpha, codec of files")
    i.add_argument("files", nargs="+")
    i.add_argument("--json", action="store_true")
    i.set_defaults(fn=cmd_info)

    au = sub.add_parser("audit", help="list oversized, mislabeled, unposted or unreferenced media",
                        description="Checks: oversized, suffix-mismatch, no-webp, no-poster, no-variants, "
                                    "missing-file, srcset-width (warn); unreferenced, never-served, mp4-only, huge-pixels (info).")
    au.add_argument("--path", action="append", help="folder to scan (repeatable; default %s)" % " ".join(AUDIT_DIRS))
    au.add_argument("--json", action="store_true", help="machine-readable output")
    au.add_argument("--verbose", "-v", action="store_true", help="also list info items")
    au.add_argument("--strict", action="store_true", help="exit 1 when any warning remains")
    au.set_defaults(fn=cmd_audit)

    pr = sub.add_parser("presets", help="list the named image size sets")
    pr.set_defaults(fn=cmd_presets)
    return p


def main(argv=None):
    p = build_parser()
    a = p.parse_args(argv)
    if not getattr(a, "fn", None):
        p.print_help()
        return 2
    try:
        return a.fn(a)
    except MediaError as e:
        log("media.py %s: error: %s" % (a.cmd, e))
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
