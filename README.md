# Soul Chef PDF API

A serverless PDF generation API that renders beautifully designed dish cards for catering events. This API generates print-ready PDF files with customized event details, dish information, and elegant card layouts.

## Overview

This API endpoint (`POST /api/pdf`) takes parsed order data and generates a professional PDF containing dish cards. It's designed to work seamlessly with the Soul Chef event management system and supports integration with n8n workflows and browser-based clients.

## Features 

- **PDF Generation**: Renders high-quality PDFs with Chromium/Puppeteer
- **Print-Ready Output**: Optimized for A2 paper with 2×4 card layout per sheet 
- **Flexible Input**: Accepts parsed order data from OpenRouter or pre-built HTML
- **Real-time Styling**: Uses Tailwind CSS for responsive, elegant card designs
- **Image Handling**: Seamlessly integrates custom assets (chef hats, decorative elements, footers)
- **Dish Customization**: Supports course categories, vegetarian/non-vegetarian badges, and dish notes

## Technical Stack

- **Runtime**: Node.js (ES Modules)
- **PDF Generation**: [Puppeteer Core](https://www.npmjs.com/package/puppeteer-core)
- **Headless Browser**: [@sparticuz/chromium](https://www.npmjs.com/package/@sparticuz/chromium)
- **Styling**: Tailwind CSS (CDN)
- **Fonts**: Google Fonts (Cormorant Garamond, Jost, Playfair Display, Poppins, Caveat)
- **Deployment**: Vercel (serverless)

## Installation

```bash
npm install
```

## Dependencies

```json
{
  "@sparticuz/chromium": "^153.0.0",
  "puppeteer-core": "^25.12.0"
}
```

## API Endpoint

### POST /api/pdf

Generates a PDF file of dish cards from order data.

#### Request Body

**Option 1: OpenRouter Order Format**
```json
{
  "order": {
    "eventDate": "October 15, 2025",
    "venue": "The Grand Ballroom",
    "pax": "150 Guests",
    "dishes": [
      {
        "name": "Butternut Squash Soup",
        "category": "Soup",
        "sub": "Roasted with sage and cream",
        "diet": "V"
      },
      {
        "name": "Pan-Seared Sea Bass",
        "category": "Main Course",
        "sub": "With citrus beurre blanc",
        "diet": "N"
      }
    ]
  }
}
```

**Option 2: HTML Format (Legacy)**
```json
{
  "html": "<html><!-- pre-built card HTML --></html>"
}
```

#### Parameters

| Field | Type | Description |
|-------|------|-------------|
| `order.eventDate` | string | Date of the event (displayed on title card) |
| `order.venue` | string | Venue name (displayed on title card) |
| `order.pax` | string | Number of guests (optional) |
| `order.dishes` | array | Array of dish objects |

#### Dish Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Dish name (required) |
| `category` | string | Course category: "Soup", "Starters", "Main Course", "Desserts", "Accompaniments", "Welcome Drink" |
| `sub` | string | Optional description/note for the dish |
| `diet` | string | "V" for vegetarian, "N" for non-vegetarian |

#### Response

- **Status**: 200 OK
- **Content-Type**: `application/pdf`
- **Body**: Binary PDF file

#### Error Responses

| Status | Response |
|--------|----------|
| 400 | `{ "error": "No order or html to print." }` |
| 405 | `{ "error": "Use POST." }` |
| 500 | `{ "error": "Could not render the PDF: [error message]" }` |

## Card Design

### Print Specifications

- **Paper Size**: A2 (16.531" × 23.385")
- **Cards Per Sheet**: 8 (2 columns × 4 rows)
- **Card Size**: 7.93" × 5.58"
- **Gap Between Cards**: 0.18"
- **Font Size**: 43pt (Tailwind-scaled)

### Card Components

1. **Title Card** (First card in PDF)
   - Event date
   - Venue name
   - Guest count
   - Soul Chef branding

2. **Dish Cards**
   - Vegetarian/Non-vegetarian indicator
   - Course badge with color-coding
   - Dish name and description
   - Decorative elements (toque, leaf sprigs, fleurons, footer)

### Color Scheme

| Element | Color | Hex |
|---------|-------|-----|
| Cream Background | `#F3EBDD` | Cream |
| Card Background | `#FBF6EC` | Off-white |
| Gold Accents | `#A98B4F` | Gold |
| Text | `#2F2A24` | Ink |
| Leaf Badge | `#7D9A5F` | Leaf Green |
| Vegetarian Dot | `#2E8B2E` | Veg Green |
| Non-veg Dot | `#C0392B` | Red |

## Usage Example

### cURL
```bash
curl -X POST https://soulchef-pdf-api.vercel.app/api/pdf \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "eventDate": "October 15, 2025",
      "venue": "The Grand Ballroom",
      "pax": "150 Guests",
      "dishes": [
        {
          "name": "Butternut Squash Soup",
          "category": "Soup",
          "sub": "Roasted with sage",
          "diet": "V"
        }
      ]
    }
  }' \
  --output dish-cards.pdf
```

### JavaScript
```javascript
const response = await fetch('https://soulchef-pdf-api.vercel.app/api/pdf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    order: {
      eventDate: 'October 15, 2025',
      venue: 'The Grand Ballroom',
      pax: '150 Guests',
      dishes: [
        {
          name: 'Butternut Squash Soup',
          category: 'Soup',
          sub: 'Roasted with sage',
          diet: 'V'
        }
      ]
    }
  })
});

const pdfBuffer = await response.arrayBuffer();
const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
const url = URL.createObjectURL(blob);
// Download or display the PDF
```

## Architecture

### File Structure

- **`api/pdf.js`** - Main API handler
  - PDF rendering logic
  - Card template functions
  - Puppeteer browser automation
  - Tailwind CSS integration

- **`assets/`** - Static images and artwork
  - Chef hat icon
  - Decorative leaf elements
  - Card footer image
  - Bottom rule separator

- **`index.html`** - Browser client (shares card markup)
  - Client-side card generation
  - Print flow integration

### Key Functions

- `renderPdf(order)` - Main PDF generation function
- `normalizeOrder(parsed)` - Transforms OpenRouter format to internal format
- `buildDocument(order)` - Constructs HTML document for rendering
- `titleCard()`, `dishCard()` - Card template builders
- `cardShell()` - Base card wrapper
- `brandMark()`, `sheetFooter()` - Reusable UI components

## CORS Headers

The API includes CORS headers for cross-origin requests:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Important Notes

### Code Synchronization
The card markup in `api/pdf.js` is kept in sync with `index.html`'s browser client. Both endpoints must use identical:
- Card HTML structure (`cardShell`, `brandMark`, `dishCard`, `sheetFooter`)
- Print CSS and page size constants
- Tailwind color and font configuration

When updating card designs, modify **both** files.

### Image Assets
All images are served from `https://soulchef-pdf-api.vercel.app/assets/` via the Vercel project, ensuring they're accessible regardless of where the calling application is hosted.

### Browser Lifecycle
Each Vercel function invocation launches a fresh Chromium browser and closes it when done. There is no persistent page or browser instance across requests.

## Troubleshooting

### Broken Images
Check the browser console for failed image requests. Ensure assets are deployed to the `assets/` folder.

### PDF Rendering Issues
- Verify Tailwind classes are correctly generated (check page.offsetWidth)
- Check Google Fonts load correctly (await page.evaluateHandle('document.fonts.ready'))
- Inspect image load status via the console logs

### Timeouts
- Increase `waitUntil` timeout in `page.setContent()` (default: 50000ms)
- Increase font/image wait timeouts if assets are slow (default: 15000ms)

## Environment

- **Node.js**: ES Modules
- **Deployment**: Vercel Serverless Functions
- **Region**: Vercel default (Global CDN)

## Development

To test locally, ensure you have a compatible version of Puppeteer and Chromium installed. The production deployment uses `@sparticuz/chromium` for Vercel compatibility.

## License

Part of the Soul Chef event management system.

## Support

For issues or questions, contact the Soul Chef team.
