# Korea Dream Path — Document Templates (homepage package)

Deployable bundle of the document-template system. All files use **relative paths**, so you can upload this whole folder anywhere (your web host, a `/templates/` subfolder, an internal share) and open the HTML directly.

## Contents
| File | What it is |
|---|---|
| `DreamPath - Document Templates.html` | Main template browser — Format Guide, Official Letter, Press Release, General Document, Weekly Report, Project Brief, Meeting Minutes, Covers, Envelope, Business Card, Email Signature |
| `DreamPath - Presentation Templates.html` | Slide / deck templates (16:9) |
| `templates.css` | All styling |
| `templates-app.js` | Navigation, scaling, page numbers, multi-page, print |
| `templates-export.js` | "Save as Word" (.doc) export |
| `dp-assets.js` | Logo + star artwork (base64, for Word export) |
| `tweaks-panel.jsx`, `templates-tweaks.jsx` | Optional in-page Tweaks panel |
| `deck-stage.js` | Slide-deck engine for the presentation file |

## How to deploy
1. Upload the entire `dist-homepage/` folder to your site (keep all files together in one folder).
2. Link to `DreamPath - Document Templates.html`. For tidy URLs you may rename it (e.g. `templates.html`); if you do, update the back-link inside the presentation file.
3. To embed inside an existing page, use an iframe:
   ```html
   <iframe src="DreamPath - Document Templates.html"
           style="width:100%;height:90vh;border:0"
           title="Korea Dream Path — Document Templates"></iframe>
   ```

## Notes
- **Fonts:** Pretendard loads from a public CDN, so visitors need internet access. To self-host, download Pretendard (https://github.com/orioncactus/pretendard) and replace the `<link>` in each HTML `<head>`.
- **Editing:** every field is click-to-edit. **Save as PDF** = pixel-exact; **Save as Word (.doc)** = editable, opens in Word / Google Docs / Hancom.
- **Tweaks panel** is an authoring aid (importance level, status, 1-/2-page length, per-document options). It only appears inside the design tool's edit mode and stays hidden on a plain website and in PDF/print — no action needed.
- **Org details** (Korea Dream Path · 120-48, Mokhyo-ro, Yongjin-eup, Wanju-gun, Jeonbuk-do 55353 · hello@koreadreampath.com · koreadreampath.com) are baked into the templates; edit any field to change per document.
