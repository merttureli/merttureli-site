"""
Helpers shared by the checks that tools/check.py runs.

Each check is a module in this package with:

    NAME   short id used by --only / --skip
    TITLE  one line for the summary table
    MODES  set of modes it runs in: "fast", "default", "full"
    run(ctx) -> Result

A check never raises for a finding; it returns a Result. An exception inside a
check is caught by check.py and reported as FAIL with the traceback.
"""
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS, WARN, FAIL, SKIP = "PASS", "WARN", "FAIL", "SKIP"

# Paths that are not site content: tooling, third-party code, scratch output.
NOT_SITE = (
    "tools/", "node_modules/", ".git/", ".claude/", "templates/",
)

# Hosts that must never be reached from a check (analytics, form posts).
BLOCKED_HOSTS = ("clarity.ms", "bing.com", "workers.dev", "formspree.io")

SITE_HOST = "merttureli.com"


class Result(object):
    def __init__(self, status, summary, details=None, artifacts=None):
        self.status = status
        self.summary = summary
        self.details = list(details or [])
        self.artifacts = list(artifacts or [])


class Context(object):
    """What check.py hands every check."""

    def __init__(self, root=ROOT, mode="default", public=False, base="HEAD", port=0,
                 verbose=False, out=None, pages=None):
        self.root = root
        self.mode = mode
        self.public = public
        self.base = base
        self.port = port
        self.verbose = verbose
        self.out = out
        self.pages = pages
        self._files = None
        self._ignored = None

    def path(self, rel):
        return os.path.join(self.root, rel)

    def files(self):
        """Every file that would be committed: tracked plus untracked-not-ignored."""
        if self._files is None:
            out = git(self.root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
            if out is None:
                found = []
                for d, dirs, names in os.walk(self.root):
                    dirs[:] = [x for x in dirs if x not in (".git", "node_modules", ".claude")]
                    for n in names:
                        found.append(os.path.relpath(os.path.join(d, n), self.root).replace(os.sep, "/"))
            else:
                found = [f for f in out.split("\0") if f]
            self._files = sorted(set(f for f in found if os.path.isfile(self.path(f))))
        return self._files

    def site_files(self, exts):
        return [f for f in self.files() if f.lower().endswith(exts)
                and not f.startswith(NOT_SITE) and "/node_modules/" not in f]

    def committable(self, rel):
        """False when rel exists on disk but git ignores it (so it would 404 once deployed)."""
        if self._ignored is None:
            self._ignored = set(self.files())
        return rel in self._ignored

    def changed(self):
        """Files changed against ctx.base (working tree, index and untracked)."""
        out = git(self.root, "diff", "--name-only", self.base, "--") or ""
        files = set(f for f in out.splitlines() if f)
        un = git(self.root, "ls-files", "--others", "--exclude-standard") or ""
        files.update(f for f in un.splitlines() if f)
        return sorted(f for f in files if os.path.isfile(self.path(f)))


def git(root, *args):
    try:
        return subprocess.check_output(("git", "-C", root) + args, stderr=subprocess.DEVNULL).decode("utf-8")
    except (OSError, subprocess.CalledProcessError):
        return None


def sh(cmd, cwd=ROOT, timeout=600, env=None):
    """Run cmd, return (exit code, combined output). Exit 127 if the program is missing."""
    try:
        p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout, env=env)
        return p.returncode, p.stdout.decode("utf-8", "replace")
    except FileNotFoundError:
        return 127, "not found: %s" % cmd[0]
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or b"").decode("utf-8", "replace")
        return 124, out + "\ntimed out after %ss" % timeout


def tail(text, n=25):
    lines = text.rstrip().splitlines()
    return lines[-n:]
