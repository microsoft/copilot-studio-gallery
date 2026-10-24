# Email rendering and accessibility notes

## Why tables, inline styles and bgcolor
Classic Outlook for Windows (2007-2019 and Microsoft 365 desktop "classic") renders HTML with Word's engine.
It ignores `max-width`, `border-radius`, flexbox/grid, background images (without VML) and margins on many
elements, and handles `<ul>`/`<p>` spacing inconsistently. What works everywhere:
- Layout with nested `<table role="presentation">`; widths as HTML attributes (`width="600"`), plus
  `style="width:100%; max-width:600px"` so mobile clients can shrink it.
- Colours as **`bgcolor` attributes and inline `background-color`** together. Some clients only honour one.
- **Spacing with cell padding**, not margins. Lists are table rows with a bullet cell, not `<ul>`.
- System font stack (`fonts.email_stack`), no web fonts. Body text at 15 px or more, footnotes at 12 px.
- Square corners. `border-radius` is ignored by classic Outlook, so the design doesn't depend on it.
- A `<!--[if mso]>` style block only resets table spacing for Outlook; everything else is inline.

## Hidden preheader
The preview text is a hidden `<div>` with `display:none; mso-hide:all; max-height:0; overflow:hidden;
opacity:0`. **`mso-hide:all` is required** - without it classic Outlook shows the text at the top of the
message. It always repeats the headline, never "view in browser".

## Dark mode
- `<meta name="color-scheme" content="light">` and `supported-color-schemes` ask Apple Mail and others to keep
  the light design.
- Outlook.com, new Outlook and the Outlook/Gmail apps may still invert or partly invert colours. The design
  survives that because it uses solid `bgcolor` blocks and text with strong contrast (4.5:1 or more), not
  transparent images or text over images.

## Charts in email: table cells, not images
| Approach | Classic Outlook (Win) | New Outlook / Outlook.com | Gmail (web/app) | Apple Mail / iOS |
|---|---|---|---|---|
| HTML table-cell bars (used here) | Yes | Yes | Yes | Yes |
| Base64 `data:` image in the body | No (2007-2016), partial (2019) | Yes | **No** - blocked on all platforms | Yes |
| CID inline attachment | Yes | Yes | Yes | Yes - but the **Draft an email** tool can't set a content ID, so this isn't available |
| SVG | No | Partly | No | Yes |
| Interactive HTML / JavaScript | Stripped everywhere | | | |

So charts in the body are table-cell bars built by `build_email.py` (percentage widths, `bgcolor`, fixed
16 px height). They also keep the body small and cost almost nothing to pass to the email tool. The
full-resolution charts live in the attached PDF.

## Logo: PDF only
The brand logo (`brand.logo_path`) is not placed in the email. The same limits as charts apply: base64 is
excluded, CID inline images need a content ID the Draft an email tool can't set, and an external URL would
need a publicly hosted image (images are blocked by default in most clients). The header band shows the
eyebrow and title as text instead; the logo is in the attached PDF.

## Size limits
- Gmail clips messages over **102 KB** ("[Message clipped]"), hiding the footer and disclaimer.
  `build_email.py` warns near the limit.
- The PDF is attached by referencing its sandbox file path in the Draft an email tool, so no base64 passes
  through the conversation. Still keep it small (charts are compressed by `render_report.py`);
  `build_email.py` warns if it is over ~3 MB.

## Accessibility checklist
- Colour is never the only signal: deltas have arrows and signs, variance bars have signed labels.
- Every bar row has the label and value as real text; the chart table carries a `summary` of all values.
- Text colours come from the brand tokens and pass 4.5:1 (`qa_report.py --tokens-only` checks them).
- Links have descriptive text, not "click here" (the body points to the attached PDF rather than a link).
- The preheader and headline state the key figure, so the message makes sense from the inbox list.
