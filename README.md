# Readeck2Zotero

[![Zotero](https://img.shields.io/badge/Zotero-8.0.4-red)](#compatibility)
[![Readeck](https://img.shields.io/badge/Readeck-0.22.2-blue)](#compatibility)
[![Release](https://img.shields.io/github/v/release/core-hn/readeck2zotero?display_name=tag)](../../releases)
[![License](https://img.shields.io/github/license/core-hn/Readeck2Zotero)](./LICENSE)

Import highlights and annotations from **Readeck** into **Zotero**.

## Features

- Import annotations from Readeck directly from a Zotero item
- Simple setup with:
  - Readeck server URL
  - Readeck API token
- Easy access from Zotero menus:
  - **Right-click an item → Import annotations from Readeck**
  - **Tools → Configure Readeck**

## Compatibility

Tested with:

- **Zotero 8.0.4**
- **Readeck 0.22.2**

## Installation

This plugin is distributed as an `.xpi` file.

1. Download the latest `.xpi` from the [Releases](../../releases) page.
2. Open Zotero.
3. Install the plugin using one of these methods:
   - drag and drop the `.xpi` file into the Zotero plugins window
   - or go to **Tools → Plugins**, click the gear icon, and choose **Install Add-on From File**
4. Restart Zotero if prompted.

> If your browser tries to open the `.xpi` instead of downloading it, save it manually to your computer first.

## Configuration

After installation:

1. Open **Tools → Configure Readeck**
2. Enter:
   - your **Readeck server URL**
   - your **API token**

Save the configuration.

## Usage

To import annotations from Readeck into a Zotero reference:

1. Select the target item in Zotero
2. Right-click it
3. Click **Import annotations from Readeck**

The plugin will fetch the available highlights and annotations from your Readeck server and import them into Zotero.

## Menu entries

- **Tools → Configure Readeck**
- **Right-click item → Import annotations from Readeck**

## Project status

Readeck2Zotero is a small utility plugin focused on one task: moving reading annotations from Readeck into Zotero as simply as possible.

Issues and feedback are welcome through GitHub Issues.

## Development

This repository contains the source code of the plugin.

To use the plugin in Zotero, download the packaged `.xpi` file from the [Releases](../../releases) page.

## Author

**Axelle Abbadie**  
GitHub: [@core-hn](https://github.com/core-hn)  
Email: axelle.abbadie@univ-montp3.fr

## Credits and license

Developed by Axelle Abbadie, with **Claude Sonnet 4.6**.

This project is open source.

Distributed under the **GPL-3.0** license. See [`LICENSE`](./LICENSE) for more information.
