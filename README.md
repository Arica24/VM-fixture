# VM Fixture

A simple visual merchandising planner for arranging shoes and advertisement signs on store displays.

## Features

- Upload individual product images or a photographed product sheet.
- Review automatic image crops and automatically read six character product IDs, such as KJ3432.
- Add or remove bars, rows and individual positions.
- Move and copy shoes, turn them vertically and change their size.
- Add advertisement squares and edit their text.
- Undo and redo changes.
- Export an image, print/save PDF, or download an editable backup.

## Project files

| File | Purpose |
| --- | --- |
| index.html | The page structure and controls |
| css/styles.css | Colours, beige wall, spacing and phone layout |
| js/app.js | Wall editor, product IDs, saving and exports |
| js/product-sheet.js | Detects shoe images in a photographed sheet |
| assets/ | App icon and advertisement image |

Built with HTML, CSS and JavaScript. No installation, account or backend is needed.

## Open it on your laptop

Keep all files and folders together and open index.html in your browser. To use it on a phone, publish the folder with GitHub Pages and open that link.

## Saving your layouts

Your layouts and uploaded pictures save in this browser using IndexedDB. Download backups regularly, before clearing browser data and before moving devices. If browser storage is blocked or full, export a backup before closing the app. Existing backups can be imported through Export > Import backup.

Printed six character product codes are read automatically and paired with nearby shoe images. Review the previews because blurry or angled photos may not read correctly. OCR runs in your browser; the first use needs internet to download the reading engine. Unreadable codes can be retried with a clearer photo or corrected in the preview.

## Editable fixture and drawing

Editable fixture starts with an outlined, SketchUp beige wall, twelve pillars and seven shelves per pillar. These are editable vector objects, not a flattened background or a full 3D model.

Use + Pillar, + Shelf and + Advertisement in the toolbar. Select a pillar to move or duplicate it with its shelves. Select a shelf to edit it separately. In Details, change dimensions and colours, duplicate or delete objects. Drag the corner handle to resize.

Choose a product and tap the wall, or drag it from Products. Its six-character product code appears below it. Use Details to edit the code, resize or turn the shoe vertically. Upload a product sheet to review detected crops, adjust them and review the automatically read codes before import. Crop detection works best with a clear, straight photo on a light background; manual cropping is available.

The drawing toolbar adds rectangles, ovals, lines, freehand strokes and text. Layouts save locally and can be exported as images or editable backups. Other visitors can upload their own images without signing in. Data stays in their own browser.

3D illustration retains the earlier static rack background. Editable bars retains the grid editor. Each view keeps its own placements.
