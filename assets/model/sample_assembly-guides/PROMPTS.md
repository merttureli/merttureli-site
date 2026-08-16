# Prompts for these guides

`sample_assembly`, camera yaw +4.0 deg, elevation 28.0 deg, 0.85x fit distance.
Subject: **welded steel test fixture**

Everything below assumes you upload a file from this folder. The point of the
guide image is that you stop describing the shape and start describing only the
light, the material and the mood. The shape is already correct because it came
out of your CAD.

---

## Vizcom  (start here. Built for product designers, free for students)

Upload `edges.png` as the drawing, or `beauty.png` with a low drawing influence.

> welded steel test fixture, studio product photograph, single large softbox from upper left
> plus a dim cool fill from the right, seamless near-black background, shallow
> depth of field, machined aluminium with a fine brushed finish and crisp
> chamfer highlights, subtle dust, 85mm lens, commercial product photography

Drawing influence 0.55 to 0.70. Below 0.4 it stops being your part. Above 0.85
it just recolours your render and you gain nothing.

## Nano Banana Pro / Gemini  (best at editing a real image without breaking it)

Upload `beauty.png` and ask for a change, not a new picture.

> Relight this exact object without changing its geometry, proportions or
> camera. One large softbox upper left, dim cool rim light behind right,
> seamless dark background falling off to black at the edges. Machined
> aluminium, brushed finish, crisp chamfers. Keep every edge and hole where it
> is. Photographic, not illustrated.

## ControlNet / ComfyUI / Flux  (most control, most setup)

`depth.png` into ControlNet Depth at weight 0.8 to 1.0, and `edges.png` into
ControlNet Canny at 0.4 to 0.6. Two stacked controls hold the shape far better
than either alone.

> welded steel test fixture, product photography, studio lighting, dark seamless backdrop,
> anodised aluminium and steel, sharp specular highlights along the chamfers,
> shallow depth of field, high detail
> Negative: cartoon, illustration, smooth blob, melted edges, extra parts,
> text, watermark

## Runway / Kling / Luma  (image to video. This is the one that gets you motion)

Upload `beauty.png` as the first frame. Then, and this is the whole trick, ask
for a CAMERA move, never a subject change. Generative video invents geometry the
moment a part has to deform, and invented mechanical geometry looks wrong to
anyone in your field.

> Slow cinematic orbit to the right around the stationary object, camera pushes
> in slightly. The object does not move or change. Studio lighting, dark
> background, dust motes drifting through the light. Locked focus, no cuts.

For the exhaust and smoke shots, the opposite applies: there is no correct
geometry, so let it invent freely.

> Dense white smoke billowing upward from below frame, backlit, slow and heavy,
> drifting right. Black background. No camera movement.

## What not to ask any of them for

Do not ask for a specific number of bolts, a tooth count, a thread, or text on
a part. They will produce something plausible and wrong, and it is exactly what
an engineer reading your site will notice first.
