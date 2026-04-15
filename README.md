# TPL Checker

A Chrome extension that checks [Toronto Public Library](https://www.tpl.ca/) ebook availability directly on Goodreads book list pages.

When you browse a Goodreads `/blog/show/` page — like a reading challenge list or editors' picks — TPL Checker adds a small badge next to each book showing whether the ebook is available, on hold, or not in the TPL collection.

## Badges

| Badge | Meaning |
|---|---|
| 🟢 eBook ✓ available | Available to borrow now |
| 🟠 eBook: on hold | In the collection but all copies are checked out |
| ⚫ eBook: not at TPL | Not in the TPL ebook collection |

Each badge links to the book's record on the TPL catalogue.

## Installation

This extension is not in the Chrome Web Store. Load it manually:

1. Clone or download this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the repo folder

To update after pulling new changes, click the refresh icon on the extension card at `chrome://extensions`.

## How it works

The extension runs on `goodreads.com/blog/show/*` pages and handles two different page layouts:

- **Editorial pages** (e.g. "Books We Can't Wait to Read") — book titles appear as text in `div.bookTitle` elements, with author names alongside
- **Challenge/list pages** (e.g. "Most Read Books of the Reading Challenge") — books appear as a cover image grid with titles only in `img alt` attributes

For each book found, it queries the [TPL Bibliocommons API](https://gateway.bibliocommons.com/) for ebook availability. API requests are proxied through the extension's background service worker to work around browser CORS restrictions.

## Files

```
manifest.json   Extension config (MV3)
content.js      Runs on Goodreads, finds books, injects badges
background.js   Service worker, proxies API requests to TPL
styles.css      Badge styles
```
