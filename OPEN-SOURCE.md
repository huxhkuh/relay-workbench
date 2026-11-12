# Open-source components and distribution

| Component | Actual use | License |
|---|---|---|
| Electron | Desktop runtime from the pinned official npm package | MIT; Chromium notices retained |
| CodeMirror 6 and language packages | Editor, tabs, selection, search and syntax | MIT |
| xterm.js and addon-fit | ANSI process-output rendering | MIT |
| jsdiff | Editor comparison and patches | BSD-3-Clause |
| fast-glob | Project file search with exclusions | MIT |
| markdown-it | Safe Markdown display with HTML/images disabled | MIT |
| esbuild | Complete source renderer and backend helper bundles | MIT |
| electron-builder / NSIS | Windows installer and portable release build | MIT for builder; NSIS/toolchain retain their own terms |
| Playwright | Native Electron tests | Apache-2.0 |
| ACP registry metadata | Discovery catalog; no auto-installation | Apache-2.0; licenses/ACP-REGISTRY.txt |

The main package-lock.json pins default dependencies. tools/build.cjs collects actual
license texts for all bundled dependency packages into desktop/vendor/WORKBENCH-LICENSES.txt.
There are no embedded fonts or imported legacy React bundles in the new build.

Official agent CLIs are installed independently and keep their own terms. The Claude
Agent SDK is optional and installed separately using tools/claude-sdk/package-lock.json;
it is not represented as MIT or included in the source or binary distribution.
Previously managed ACP CLI installation metadata remains in tools/managed-agents.package.json.
Its presence does not automatically install, authenticate or authorize those tools.

Primary upstreams: [Electron](https://github.com/electron/electron),
[CodeMirror](https://github.com/codemirror/dev), [xterm.js](https://github.com/xtermjs/xterm.js),
[jsdiff](https://github.com/kpdecker/jsdiff), [fast-glob](https://github.com/mrmlnc/fast-glob),
[markdown-it](https://github.com/markdown-it/markdown-it), [esbuild](https://github.com/evanw/esbuild),
[Playwright](https://github.com/microsoft/playwright), [ACP registry](https://github.com/agentclientprotocol/registry).
