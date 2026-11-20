# Momentful I/O

This repository contains the source code and content of the [Momentful I/O website](https://momentful.io), along with its local editing tools. Eleventy builds the static site, and Sveltia CMS lets you edit content and preview changes on your computer.

## Setup

Install Node.js 22.19 or later with npm. Use a current version of Chrome or Edge for the CMS. Run commands from the project folder containing `package.json`.

```sh
npm ci
```

The initial installation requires internet access.

## Commands

| Command | What it does |
|---|---|
| `npm run editor` | Starts the CMS and local website preview. |
| `npm run build` | Builds the website into `_site/` without uploading it. |
| `npm run deploy:check` | Checks the deployment configuration, builds the site, and checks the files selected for upload without connecting to the server. |
| `npm run deploy` | Builds the site and publishes it over SFTP or FTPS. |

## Local editing

- Run `npm run editor` and open the address printed in the terminal, usually <http://127.0.0.1:8090/start/>.
- Select **Open content editor**, choose **Work with Local Repository**, and grant access to the project folder.
- Use **Save**, wait for **Entry saved**, and review your changes with **Preview website**.
- Keep the terminal open during the session and press **Ctrl+C** after saving to stop the editor.

You can edit website pages and projects through the CMS or directly in `src/`. The CMS saves your changes as files and does not commit them, so use Git as usual. Each editor session first copies the current content to `.local/content-backups/`.

## Publishing

Publishing is done by maintainers with access to the web server. Copy `.env.example` to `.env` and enter the SFTP or FTPS settings there. The comments in `.env.example` explain each setting. Keep credentials private and back up the live files on the server before each release.

Run `npm run deploy:check` first. **`npm run deploy` publishes to the live site** and runs a fresh build automatically. Wait for the "DEPLOYMENT SUCCESSFUL" message and check the live website. The script uploads only the contents of `_site/` and leaves existing server files in place unless it overwrites them.

## Project structure

| Path | Contents |
|---|---|
| `src/` | Website source, including content in `pages/` and `projects/`, styles, and graphics. |
| `cms/` | Local CMS and editor start page. |
| `scripts/` | Editor, build, and deployment scripts. |
| `_site/` | Build output. Make content changes in the source files or the CMS. |

## Contributing

Issues and pull requests are welcome. Contributions are accepted under the same terms as the repository: code under Apache-2.0, website content under CC BY-SA 4.0.

## License

- Code: [Apache-2.0](LICENSE)
- Content: [CC BY-SA 4.0](LICENSE-CONTENT)
- Logos: [Branding & Trademarks](src/pages/branding.md)
- Other: [NOTICE](NOTICE)
