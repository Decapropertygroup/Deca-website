# Adding a project to the site

The portfolio is two things: a card on `projects.html`, and a case study page
named `project-<address-slug>.html`. Copy `project-368-ruthven-st.html` as the
template. It is plain HTML, there is no build step.

## What to send for each job

- **Photos.** Anything from the job. More is better, they get filtered here.
- **Address**, or the suburb if the address should not be published.
- **What the work actually was**, in trade terms.
- **When it finished.**
- **Anything measurable**: days on site, area covered, whether the building
  kept trading, what system or product was used.

## Rules that apply to every project page

These are not style preferences, they are the same non-negotiables as the
quotes and reports:

- **No subcontractor or trade-partner trace.** No company names, no logos in
  photos, no wording that implies anyone but Deca did the work. Crews are
  "Deca technicians under Deca supervision". Zoom in and read any logo on a
  shirt or a vehicle before publishing the shot; do not assume.
- **No em dashes** between words. Hyphens or restructure the sentence.
- **Do not mention QBCC.**
- **Do not name the client** without their say-so. The building address is
  usually fine on its own.

## Photo prep

Long edge 1600px, JPEG quality 82, progressive. Into `photos/<job-slug>/`.

```
python3 -c "
from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open('IN.JPG')).convert('RGB')
im.thumbnail((1600,1600), Image.LANCZOS)
im.save('photos/<job>/<name>.jpg','JPEG',quality=82,optimize=True,progressive=True)"
```

`exif_transpose` matters: without it phone photos come out rotated.

## Layout notes

- Gallery tiles are `<figure class="shot">`. They force a 4:3 crop so a mix of
  portrait and landscape shots still lines up on an even grid.
- A photo that must not be cropped goes in a feature slot instead, with its
  own `aspect-ratio` set on the `<img>`.
- Reveal-on-scroll classes cycle `rv`, `rv d1`, `rv d2` down a grid.
- Never add a per-page `<style>` block. All styling lives in `styles.css`.
  Five duplicated style blocks are why "increase font sizes" got committed
  four separate times.

## Checking before it goes live

```
grep -il 'qbcc\|cmx\|subcontractor' *.html   # must return nothing
grep -l '—' *.html                            # must return nothing
```

Push a branch rather than committing to `main`. Vercel builds a preview for
every branch, and `main` is what replaces the live site.
