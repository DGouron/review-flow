# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.3.0...reviewflow-v3.3.1) (2026-02-13)


### Fixed

* **config:** allow empty usernames for single-platform users ([549de26](https://github.com/DGouron/review-flow/commit/549de268e33d2b041bd69e703b6b4f4978a681e7))
* **config:** allow empty usernames for single-platform users ([853b71f](https://github.com/DGouron/review-flow/commit/853b71f0eb6c8d21ccfceb25c3b96cd3f0bcfb0f))
* **tracking:** remove averageScore from TrackedMr, use latestScore for MR cards ([c2d6f93](https://github.com/DGouron/review-flow/commit/c2d6f93380580e91bb31bc4d39f08c7189632706)), closes [#43](https://github.com/DGouron/review-flow/issues/43)
* **tracking:** remove averageScore, use latestScore for MR cards ([cb8f572](https://github.com/DGouron/review-flow/commit/cb8f5723e4184cfb3d64e13a4f314eec385dee96))
* use node: prefix and explicit __dirname for ESM compatibility ([5774bfd](https://github.com/DGouron/review-flow/commit/5774bfdea08234d2fe60f5b7daccd6b32d25ba93))


### Changed

* configure TypeScript path aliases (@/) ([69810ab](https://github.com/DGouron/review-flow/commit/69810abeb3408ed5db15b15e8e120a6458bdad1f))
* configure TypeScript path aliases (@/) ([063692a](https://github.com/DGouron/review-flow/commit/063692a605877320b4901201d223b0d96ac84653)), closes [#84](https://github.com/DGouron/review-flow/issues/84)

## [3.3.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.2.0...reviewflow-v3.3.0) (2026-02-12)


### Added

* **followup:** re-verify Important issues on pending-approval MRs ([7fe00b1](https://github.com/DGouron/review-flow/commit/7fe00b1eba4ab96973021b488c34fc8054b6dde4))
* **followup:** re-verify Important issues on pending-approval MRs ([cb17aff](https://github.com/DGouron/review-flow/commit/cb17aff79827121c701b95706d36af2996cb85b6))


### Fixed

* **docs:** remove double base path in Get Started links ([7aa2f7d](https://github.com/DGouron/review-flow/commit/7aa2f7d22d186fce10521b1df7ae9c1f36917b15))
* **docs:** remove withBase() causing double base path in links ([4944546](https://github.com/DGouron/review-flow/commit/4944546a2eac94b2955912ec5e425803f985a799))

## [3.2.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.1.1...reviewflow-v3.2.0) (2026-02-12)


### Added

* **cli:** add interactive setup wizard and config validation ([5ca96b6](https://github.com/DGouron/review-flow/commit/5ca96b601be6cad015551aba0d383e6f5494989b))
* **cli:** add reviewflow init wizard and validate command ([41ee87b](https://github.com/DGouron/review-flow/commit/41ee87b924bd9e9a72517e736913950ac8d7d4bf))

## [3.1.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.1.0...reviewflow-v3.1.1) (2026-02-11)


### Fixed

* **cli:** resolve symlinks for global npm install detection ([5f70ee6](https://github.com/DGouron/review-flow/commit/5f70ee6763e24348aa9cfd07d78e0f0f33ab2c56))
* **cli:** resolve symlinks for global npm install detection ([8ed3b45](https://github.com/DGouron/review-flow/commit/8ed3b45fecf07ce69a9c6eb3dc6d46bd240de317))

## [3.1.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.0.1...reviewflow-v3.1.0) (2026-02-11)


### Added

* **ci:** auto-publish to npm on release + fix docs links ([f7ee456](https://github.com/DGouron/review-flow/commit/f7ee4568383335783c2a8211ab4cb8e58fc2f099))
* **ci:** auto-publish to npm on release + fix docs links ([8bb40dd](https://github.com/DGouron/review-flow/commit/8bb40ddab87793c56c97398111211f0311abbc4e))
* **cli:** add start, stop, status, logs commands with daemon support ([b85ec78](https://github.com/DGouron/review-flow/commit/b85ec78ec8459efaf59c5427ed7f0c231354c5fb))
* **cli:** add start, stop, status, logs commands with daemon support ([abf21fe](https://github.com/DGouron/review-flow/commit/abf21fe46fde157ae8c532ac8907db7b553b95b6))
* **cli:** display startup banner with URLs and --open flag ([8a39a60](https://github.com/DGouron/review-flow/commit/8a39a60775b9b806f66437a559918d2b10ce17b0))
* **cli:** display startup banner with URLs and add --open flag ([2a5f60d](https://github.com/DGouron/review-flow/commit/2a5f60dd4cac4ac8fdf560fbd4e1a2b07202b3ba))


### Fixed

* **docs:** replace broken README links with VitePress URLs ([9eca8e2](https://github.com/DGouron/review-flow/commit/9eca8e23cb44b367a29d009ff0298c2f251051be))
* **docs:** replace broken README links with VitePress URLs and update quick-start ([bc3fca8](https://github.com/DGouron/review-flow/commit/bc3fca8e82337a454480d84e498c9ac185bcfa16))
* **lint:** replace delete operator with undefined assignment ([ca72a49](https://github.com/DGouron/review-flow/commit/ca72a4947db4e5af988e026253601b56531c4d03))
* **security:** use execFileSync to prevent command injection in browserOpener ([ab056bc](https://github.com/DGouron/review-flow/commit/ab056bc47e0e8b043f5c37fd6677044bed96294d))


### Changed

* remove Strangler Fig re-exports and move ProjectStatsCalculator to presenters ([8f1ef13](https://github.com/DGouron/review-flow/commit/8f1ef130b7fc98dd544df3d12a61e73202774fb2))
* remove Strangler Fig re-exports and relocate presenter ([8a9ac05](https://github.com/DGouron/review-flow/commit/8a9ac05d2073ff2d033db837c9929cfc37e3a436))

## [3.0.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.0.0...reviewflow-v3.0.1) (2026-02-09)


### Fixed

* align all URLs and references with review-flow repo name ([1167969](https://github.com/DGouron/review-flow/commit/1167969e329d1a924039f1de0dfaebb17aaf1d0f))
* align URLs and references with review-flow repo name ([fcdbe7b](https://github.com/DGouron/review-flow/commit/fcdbe7b01c458d2c43de06781d0852905bbeba10))

## [3.0.0](https://github.com/DGouron/claude-review-automation/compare/reviewflow-v2.0.1...reviewflow-v3.0.0) (2026-02-08)


### ⚠ BREAKING CHANGES

* **deps:** @fastify/websocket v9+ passes WebSocket directly instead of connection.socket wrapper
* **security:** Users must now copy config.example.json to config.json and fill in their own values.

### Added

* add CLI entry point and fix distribution blockers (MVP tickets [#1](https://github.com/DGouron/claude-review-automation/issues/1)-[#4](https://github.com/DGouron/claude-review-automation/issues/4)) ([9df0773](https://github.com/DGouron/claude-review-automation/commit/9df0773ebf5a8716b0785ec9d26e4a29e6711368))
* add deployment docs and restructure architecture ([2c26fa6](https://github.com/DGouron/claude-review-automation/commit/2c26fa662a0e25362d774a6ebd075d4f3a8cf5ac))
* add dynamic dashboard tabs and followup job tracking ([07b85b4](https://github.com/DGouron/claude-review-automation/commit/07b85b4da0ce14384a0792ed11a52bb0e21f166a))
* add gateway pattern for Clean Architecture decoupling ([462c134](https://github.com/DGouron/claude-review-automation/commit/462c134355ada077d8e5a71670d5359668a693de))
* add memory guard and fix followup debug logging ([c7a2c34](https://github.com/DGouron/claude-review-automation/commit/c7a2c34c23bd427026897d0c8b33789ef321a7d9))
* add POST_INLINE_COMMENT MCP action ([a8b9f28](https://github.com/DGouron/claude-review-automation/commit/a8b9f28aba0acfb175b6ea3f1e461702644cdd4b))
* add POST_INLINE_COMMENT MCP action for platform-agnostic inline comments ([4d739c5](https://github.com/DGouron/claude-review-automation/commit/4d739c59799264c708de05e980be88d8188b70a0))
* add presenters and shared foundation interfaces ([7ba223c](https://github.com/DGouron/claude-review-automation/commit/7ba223c3b16fa88eb655b7e74f494e7930b2d3ee))
* add project config loader with multi-platform support ([a650eb9](https://github.com/DGouron/claude-review-automation/commit/a650eb9daf728598a1caf42262897e8b2002e278))
* add real-time updates, MR tracking, and dashboard improvements ([c61edbc](https://github.com/DGouron/claude-review-automation/commit/c61edbcf61da1b0683d360544619eed658b46965))
* add thread sync, GitHub support, templates, and fix stats parsing ([a710032](https://github.com/DGouron/claude-review-automation/commit/a710032e624617b3752c6cc4ae8f57e57131e42f))
* add use cases, ACL, value objects and ubiquitous language ([d33787f](https://github.com/DGouron/claude-review-automation/commit/d33787f96a889c4dd5830ae86e2b3b4bc61be97e))
* add Vitest test infrastructure with 90 tests ([6b54daa](https://github.com/DGouron/claude-review-automation/commit/6b54daa450de80de037bb2239840f2d4ef3d6353))
* auto-cleanup tracking when MR/PR is closed ([78ecaa3](https://github.com/DGouron/claude-review-automation/commit/78ecaa3e493692b6187b114f4e5417a621c85564))
* **cli:** add automatic Claude CLI path resolution ([b2a77c1](https://github.com/DGouron/claude-review-automation/commit/b2a77c1e99a5d2eb4b2cada56596f983c3da1c18))
* composition root completion + bug fixes ([f271240](https://github.com/DGouron/claude-review-automation/commit/f27124094ea373b26b0af88c10c32ac1c331e9a9))
* **context:** add Claude write capability to review context file ([47e2d97](https://github.com/DGouron/claude-review-automation/commit/47e2d97ec89537216da0a42a523d551649b4a422))
* **context:** add Claude write capability to review context file ([8a3a020](https://github.com/DGouron/claude-review-automation/commit/8a3a020ec5c6d0c8a0382c7579a9f199a86bcf6b))
* **context:** add live tracking of review context file ([5644150](https://github.com/DGouron/claude-review-automation/commit/5644150cac72b511bfaaeaf08e322328723b87d3))
* **context:** add live tracking of review context file ([a62b00d](https://github.com/DGouron/claude-review-automation/commit/a62b00d95ad0632cb9b3a7616487090a35bc64e1))
* **context:** add review context file infrastructure ([d736c0e](https://github.com/DGouron/claude-review-automation/commit/d736c0e967348561d622780c486e1b681fc2cb15))
* **context:** integrate review context in controllers ([d2db97b](https://github.com/DGouron/claude-review-automation/commit/d2db97b61d22a69042e39d725ebda5a4ec856a4a))
* **context:** review context file infrastructure (ticket 007) ([982931a](https://github.com/DGouron/claude-review-automation/commit/982931a3acba6015cba19b76be33d806c8c2a28c))
* **dashboard:** add auto-followup toggle and cancel review button ([1f32df8](https://github.com/DGouron/claude-review-automation/commit/1f32df8d25f22d6ae291e1f7e8f310722c89c536))
* display PR/MR title in review history ([5662859](https://github.com/DGouron/claude-review-automation/commit/566285950fc72b77a355535c00b3850b2b1b7f50))
* **docs:** add custom theme with cyan brand colors and typography ([3cf5560](https://github.com/DGouron/claude-review-automation/commit/3cf5560b54982e01d09a7fb4d9cdce4c95516e45))
* **docs:** add landing page with hero section and feature grid ([a38a487](https://github.com/DGouron/claude-review-automation/commit/a38a487c601fda92d03583d8249906eb648ab7a9))
* **docs:** add logo, favicon, and social media meta tags ([f1aeedc](https://github.com/DGouron/claude-review-automation/commit/f1aeedcd80e2a0ba1f0dfb0e0ff262afdf70eee2))
* **docs:** add quick start steps and platform badges to landing page ([013b6a1](https://github.com/DGouron/claude-review-automation/commit/013b6a14ba8465d9c1edeead15dba7d1fa63adad))
* **docs:** install VitePress and configure foundation ([5008acc](https://github.com/DGouron/claude-review-automation/commit/5008accaa2f5203d35d49479b7e98aef2197614a))
* **entities:** unify ThreadAction and ReviewContextAction into ReviewAction ([dcece2f](https://github.com/DGouron/claude-review-automation/commit/dcece2fd79a854f6179ef3c45ea1d96c51e89448))
* **gateways:** add GitHubReviewActionCliGateway and backward compat wrappers ([21e269a](https://github.com/DGouron/claude-review-automation/commit/21e269a60567251d460abe4f06ee1dd4a8fbebfe))
* GitHub PR tracking + dashboard UI fixes ([1bccfc1](https://github.com/DGouron/claude-review-automation/commit/1bccfc15eb9af93f9449cac71bfc77930e732d10))
* **main:** complete Composition Root with full feature parity ([3521f89](https://github.com/DGouron/claude-review-automation/commit/3521f89a358ed2d254fb25811f4f95033b02e926))
* **main:** create Composition Root for Clean Architecture ([90ae639](https://github.com/DGouron/claude-review-automation/commit/90ae6390fce460343cf36abcb7b887f32f9db14b))
* **main:** create Composition Root structure ([d8bc0b1](https://github.com/DGouron/claude-review-automation/commit/d8bc0b1e191d9a44f76766bdc9dd67325a071e70))
* **mcp:** add file-based context for MCP server ([9d0c8d6](https://github.com/DGouron/claude-review-automation/commit/9d0c8d6c515cf14cd0517341dee89610946ccb18))
* **mcp:** add file-based logging for MCP server debugging ([ab2739f](https://github.com/DGouron/claude-review-automation/commit/ab2739f264b097941696e65bdd716aacd561dce2))
* **mcp:** add MCP handlers and fix dashboard assignee attribution ([56a561f](https://github.com/DGouron/claude-review-automation/commit/56a561fb8405aba657c68d1d0afe890c08eedd05))
* **mcp:** add MCP server infrastructure with progress gateway ([fdd6d62](https://github.com/DGouron/claude-review-automation/commit/fdd6d6235b80b5c658d4fe22da64d816c16f095e))
* **mcp:** auto-create .mcp.json in project directory ([278144c](https://github.com/DGouron/claude-review-automation/commit/278144c70b8e6ab0d96654009fd0f86dfb83ed47))
* **mcp:** inject authoritative MCP instructions via system prompt ([670cb9d](https://github.com/DGouron/claude-review-automation/commit/670cb9d6b186d0de0b0a5011d5f7e6734bea37dc))
* **mcp:** MCP server infrastructure for real-time review progress ([752474b](https://github.com/DGouron/claude-review-automation/commit/752474bcb80a513b6635ff6b7150bce7a329153c))
* **mcp:** per-job context files and lazy-loading for concurrent reviews ([5be6a23](https://github.com/DGouron/claude-review-automation/commit/5be6a2320e9dc208864ff3ca5f05cedf10a5e253))
* MVP reviewflow CLI package distribution ([07294bb](https://github.com/DGouron/claude-review-automation/commit/07294bbbe5524f92ddd97af35413c05f53ac09a7))
* rename package from claude-review-automation to reviewflow ([7850479](https://github.com/DGouron/claude-review-automation/commit/78504792fffe5038791905847cac478f6c80e105))
* simplify config and add portable launcher ([f6048fa](https://github.com/DGouron/claude-review-automation/commit/f6048fa78d4e87d3473f404a5f38cf6691de9386))
* Standardized review markers with templates and documentation ([c613d7c](https://github.com/DGouron/claude-review-automation/commit/c613d7cb9404b01c060bdd8793f4d739e1ce6738))
* **templates:** add EN/FR skill templates (SPEC-003) ([42add0b](https://github.com/DGouron/claude-review-automation/commit/42add0b3700a6c968f009ff2966095ac0c4bf247))
* **thread-actions:** add standardized review markers parsing and execution ([f4d5353](https://github.com/DGouron/claude-review-automation/commit/f4d5353fbd8bfbbde53bb5d48ab76e102cefa508))
* **webhook:** add label trigger for GitHub reviews ([7a33628](https://github.com/DGouron/claude-review-automation/commit/7a33628940fa4324013630b6e1af19ea2ca75e01))
* **webhook:** add MR tracking for GitHub PRs ([7915bb1](https://github.com/DGouron/claude-review-automation/commit/7915bb128704e2b860819e86379a8f5000fe1aa4))


### Fixed

* address PR [#20](https://github.com/DGouron/claude-review-automation/issues/20) review blocking issues ([43c2b4f](https://github.com/DGouron/claude-review-automation/commit/43c2b4f3c61d57a7ad43657946e7fb421b0f4125))
* address PR [#20](https://github.com/DGouron/claude-review-automation/issues/20) review important items ([#3](https://github.com/DGouron/claude-review-automation/issues/3) and [#4](https://github.com/DGouron/claude-review-automation/issues/4)) ([05aaaff](https://github.com/DGouron/claude-review-automation/commit/05aaaffdf0ab38ccd19d5a080e9fd53657fd8236))
* address PR [#7](https://github.com/DGouron/claude-review-automation/issues/7) review feedback - configurable polling and websocket tests ([5fcc278](https://github.com/DGouron/claude-review-automation/commit/5fcc278975ae5a5403e18ed323af278f7cdada23))
* address PR review comments ([cf3641a](https://github.com/DGouron/claude-review-automation/commit/cf3641ae316e978d8e77a7d01b5d0c9d2ad3c1a1))
* address PR review findings (non-null assertion, DRY, DIP) ([3553317](https://github.com/DGouron/claude-review-automation/commit/3553317298b57047543b3705e98389b90e43195e))
* **build:** update dashboard path in build script ([dafa4d3](https://github.com/DGouron/claude-review-automation/commit/dafa4d3aa5a6d5cabd80de6657ff54c4f2b568d8))
* **dashboard:** correct API status endpoint URL ([048cd84](https://github.com/DGouron/claude-review-automation/commit/048cd84d989e1b75895b8cfdae50b18e47fd11dd))
* **dashboard:** enlarge model card container ([6db215d](https://github.com/DGouron/claude-review-automation/commit/6db215d6f02d4aa03fe5076a52132c87de010f94))
* **dashboard:** fix data mapping and add debug logging ([25cebac](https://github.com/DGouron/claude-review-automation/commit/25cebac53a64074034148358ee712dffd4108c1f))
* **dashboard:** fix model select overflow and project info layout ([6e3b257](https://github.com/DGouron/claude-review-automation/commit/6e3b2577c581079de584a53317d6fc207845036b))
* display stats in dashboard ([2edacd2](https://github.com/DGouron/claude-review-automation/commit/2edacd2de93dde7183bc28a5d62682b9d6f984c1))
* **docs:** correct copyright year to 2026 ([69ba7a9](https://github.com/DGouron/claude-review-automation/commit/69ba7a9f5d2e9253bcf8cb424fbfb237e49ef6b8))
* **docs:** correct copyright year to 2026 ([8448faa](https://github.com/DGouron/claude-review-automation/commit/8448faa6e9fcf91963a5a9e544d3ff52e312e3ef))
* **docs:** correct copyright year to 2026 ([afe694e](https://github.com/DGouron/claude-review-automation/commit/afe694e50b5456ef5c4994747ae66da46cbbfa02))
* **github:** add title and assignedBy to job for dashboard display ([d027356](https://github.com/DGouron/claude-review-automation/commit/d0273562f2df45271eb569b66a6220b2e484bea7))
* **lint:** configure Biome and fix lint errors ([8ef360e](https://github.com/DGouron/claude-review-automation/commit/8ef360e1fd66bea05550b0c2e431beb9e0845cb7))
* **lint:** resolve Biome noDelete and useImportType errors ([9f932b0](https://github.com/DGouron/claude-review-automation/commit/9f932b0fe747599d14e381d2ab4ee08c37df2c08))
* **mcp:** pass env vars via --mcp-config instead of process env ([893c62e](https://github.com/DGouron/claude-review-automation/commit/893c62e1902eba696744776ba4b7f7463d67e937))
* **mcp:** remove --mcp-config and --dangerously-skip-permissions ([4baf630](https://github.com/DGouron/claude-review-automation/commit/4baf6300c305d63823a4f5a28eedf740da8ee210))
* prevent followup from triggering new review + sync threads after followup ([981f49c](https://github.com/DGouron/claude-review-automation/commit/981f49cb7dc220eb971bbadfc3d98076a5a01ddd))
* **progress:** write progress to context file for live dashboard updates ([26ae254](https://github.com/DGouron/claude-review-automation/commit/26ae254a34bdcc31092d8434c49708e624c8ab64))
* support GitHub PR filename format in reviews ([b727822](https://github.com/DGouron/claude-review-automation/commit/b727822b074afb86a41dd4bcc916ed00fd721789))
* **tracking:** warnings should not block MR approval ([45068aa](https://github.com/DGouron/claude-review-automation/commit/45068aa602f47688144ab517c0f4e5a6b6d12922))
* **tracking:** warnings should not block MR approval ([7dc12ef](https://github.com/DGouron/claude-review-automation/commit/7dc12ef8ac18c50a5f4cbc203cf97342daf2fa74))
* **webhook:** add filterGitLabMrMerge to detect merged MRs ([fd33009](https://github.com/DGouron/claude-review-automation/commit/fd33009c44328f24e9298447a6b8b9478758ae3e))
* **webhook:** address PR review feedback - type safety and tests ([0734289](https://github.com/DGouron/claude-review-automation/commit/07342892217ae4cdaaa1bd0f78fbe57f7e7a2cb7))


### Changed

* add SyncThreadsUseCase reusing existing ThreadFetchGateway ([c6e11e9](https://github.com/DGouron/claude-review-automation/commit/c6e11e92bcd161679da3665a2d4fb3f6ce478875))
* **arch:** create frameworks layer with Strangler Fig migration ([db54aaa](https://github.com/DGouron/claude-review-automation/commit/db54aaa328266311bc2d75e29265bac5a3aaa90c))
* create tracking use cases with UseCase&lt;Input, Output&gt; pattern ([208a4d8](https://github.com/DGouron/claude-review-automation/commit/208a4d8c459ecb7fefd9f77b1facb101ce71a58f))
* enrich ReviewRequestTrackingGateway with query/remove methods ([d111e92](https://github.com/DGouron/claude-review-automation/commit/d111e927ece9361065861e4b060450ee2d11d3c0))
* **entities:** move progress types to domain layer ([7f2c054](https://github.com/DGouron/claude-review-automation/commit/7f2c054c3547860a829afe6532be215da76e2b83))
* **executor:** extract magic number to named constant ([0583f78](https://github.com/DGouron/claude-review-automation/commit/0583f7831bb15a5441a24b34df3cb212ca0bc65c))
* extract ProjectStatsCalculator to interface-adapters/services ([8a4a198](https://github.com/DGouron/claude-review-automation/commit/8a4a198634ff174fd8e0b7f01bb813fb56596e63))
* extract tracking types to entities/tracking/ ([aa0242d](https://github.com/DGouron/claude-review-automation/commit/aa0242de91baf7a00c44d1edc6c0d31c51668e74))
* **main:** complete composition root with WebSocket dependencies ([57dfd58](https://github.com/DGouron/claude-review-automation/commit/57dfd58bfdd31ee65526f3987b82a46f3c53b5a5))
* migrate all consumers to gateway+usecases, delete mrTrackingService ([db03372](https://github.com/DGouron/claude-review-automation/commit/db033724f128c5717b3266783bdf089a552c1172))
* move http routes to interface-adapters/controllers ([5b3b788](https://github.com/DGouron/claude-review-automation/commit/5b3b788f1c546ed3131840d15ac21702a8b41f24))
* move webhooks to interface-adapters/controllers ([d7713ee](https://github.com/DGouron/claude-review-automation/commit/d7713ee31dea893c09bc73286a9514ad9e50111c))
* rename acl/ to adapters/ for Clean Architecture compliance ([cd16b44](https://github.com/DGouron/claude-review-automation/commit/cd16b4479f8427b4cef7dfba3d2ffcaf5b1ceb83))
* split mrTrackingService God Object (BACKLOG-013) ([1ce0b35](https://github.com/DGouron/claude-review-automation/commit/1ce0b3570f425c739db96d8ff8d8cba698150f22))


### Miscellaneous

* **deps:** upgrade to Fastify v5 with compatible plugins ([c1661f7](https://github.com/DGouron/claude-review-automation/commit/c1661f7b726224d36c7466c7582629c8c08fbabf))
* **security:** remove personal config from tracking ([b1d8892](https://github.com/DGouron/claude-review-automation/commit/b1d8892dcf6d142cc4f4728a79ff51ea1a419838))

## [2.0.1](https://github.com/DGouron/claude-review-automation/compare/claude-review-automation-v2.0.0...claude-review-automation-v2.0.1) (2026-02-08)


### Fixed

* address PR review findings (non-null assertion, DRY, DIP) ([3553317](https://github.com/DGouron/claude-review-automation/commit/3553317298b57047543b3705e98389b90e43195e))


### Changed

* migrate all consumers to gateway+usecases, delete mrTrackingService ([db03372](https://github.com/DGouron/claude-review-automation/commit/db033724f128c5717b3266783bdf089a552c1172))
* split mrTrackingService God Object (BACKLOG-013) ([1ce0b35](https://github.com/DGouron/claude-review-automation/commit/1ce0b3570f425c739db96d8ff8d8cba698150f22))

## [2.0.0](https://github.com/DGouron/claude-review-automation/compare/claude-review-automation-v1.0.0...claude-review-automation-v2.0.0) (2026-02-07)


### ⚠ BREAKING CHANGES

* **deps:** @fastify/websocket v9+ passes WebSocket directly instead of connection.socket wrapper
* **security:** Users must now copy config.example.json to config.json and fill in their own values.

### Added

* add deployment docs and restructure architecture ([2c26fa6](https://github.com/DGouron/claude-review-automation/commit/2c26fa662a0e25362d774a6ebd075d4f3a8cf5ac))
* add dynamic dashboard tabs and followup job tracking ([07b85b4](https://github.com/DGouron/claude-review-automation/commit/07b85b4da0ce14384a0792ed11a52bb0e21f166a))
* add gateway pattern for Clean Architecture decoupling ([462c134](https://github.com/DGouron/claude-review-automation/commit/462c134355ada077d8e5a71670d5359668a693de))
* add memory guard and fix followup debug logging ([c7a2c34](https://github.com/DGouron/claude-review-automation/commit/c7a2c34c23bd427026897d0c8b33789ef321a7d9))
* add POST_INLINE_COMMENT MCP action ([a8b9f28](https://github.com/DGouron/claude-review-automation/commit/a8b9f28aba0acfb175b6ea3f1e461702644cdd4b))
* add POST_INLINE_COMMENT MCP action for platform-agnostic inline comments ([4d739c5](https://github.com/DGouron/claude-review-automation/commit/4d739c59799264c708de05e980be88d8188b70a0))
* add presenters and shared foundation interfaces ([7ba223c](https://github.com/DGouron/claude-review-automation/commit/7ba223c3b16fa88eb655b7e74f494e7930b2d3ee))
* add project config loader with multi-platform support ([a650eb9](https://github.com/DGouron/claude-review-automation/commit/a650eb9daf728598a1caf42262897e8b2002e278))
* add real-time updates, MR tracking, and dashboard improvements ([c61edbc](https://github.com/DGouron/claude-review-automation/commit/c61edbcf61da1b0683d360544619eed658b46965))
* add thread sync, GitHub support, templates, and fix stats parsing ([a710032](https://github.com/DGouron/claude-review-automation/commit/a710032e624617b3752c6cc4ae8f57e57131e42f))
* add use cases, ACL, value objects and ubiquitous language ([d33787f](https://github.com/DGouron/claude-review-automation/commit/d33787f96a889c4dd5830ae86e2b3b4bc61be97e))
* add Vitest test infrastructure with 90 tests ([6b54daa](https://github.com/DGouron/claude-review-automation/commit/6b54daa450de80de037bb2239840f2d4ef3d6353))
* auto-cleanup tracking when MR/PR is closed ([78ecaa3](https://github.com/DGouron/claude-review-automation/commit/78ecaa3e493692b6187b114f4e5417a621c85564))
* **cli:** add automatic Claude CLI path resolution ([b2a77c1](https://github.com/DGouron/claude-review-automation/commit/b2a77c1e99a5d2eb4b2cada56596f983c3da1c18))
* composition root completion + bug fixes ([f271240](https://github.com/DGouron/claude-review-automation/commit/f27124094ea373b26b0af88c10c32ac1c331e9a9))
* **context:** add Claude write capability to review context file ([47e2d97](https://github.com/DGouron/claude-review-automation/commit/47e2d97ec89537216da0a42a523d551649b4a422))
* **context:** add Claude write capability to review context file ([8a3a020](https://github.com/DGouron/claude-review-automation/commit/8a3a020ec5c6d0c8a0382c7579a9f199a86bcf6b))
* **context:** add live tracking of review context file ([5644150](https://github.com/DGouron/claude-review-automation/commit/5644150cac72b511bfaaeaf08e322328723b87d3))
* **context:** add live tracking of review context file ([a62b00d](https://github.com/DGouron/claude-review-automation/commit/a62b00d95ad0632cb9b3a7616487090a35bc64e1))
* **context:** add review context file infrastructure ([d736c0e](https://github.com/DGouron/claude-review-automation/commit/d736c0e967348561d622780c486e1b681fc2cb15))
* **context:** integrate review context in controllers ([d2db97b](https://github.com/DGouron/claude-review-automation/commit/d2db97b61d22a69042e39d725ebda5a4ec856a4a))
* **context:** review context file infrastructure (ticket 007) ([982931a](https://github.com/DGouron/claude-review-automation/commit/982931a3acba6015cba19b76be33d806c8c2a28c))
* **dashboard:** add auto-followup toggle and cancel review button ([1f32df8](https://github.com/DGouron/claude-review-automation/commit/1f32df8d25f22d6ae291e1f7e8f310722c89c536))
* display PR/MR title in review history ([5662859](https://github.com/DGouron/claude-review-automation/commit/566285950fc72b77a355535c00b3850b2b1b7f50))
* **docs:** add custom theme with cyan brand colors and typography ([3cf5560](https://github.com/DGouron/claude-review-automation/commit/3cf5560b54982e01d09a7fb4d9cdce4c95516e45))
* **docs:** add landing page with hero section and feature grid ([a38a487](https://github.com/DGouron/claude-review-automation/commit/a38a487c601fda92d03583d8249906eb648ab7a9))
* **docs:** add logo, favicon, and social media meta tags ([f1aeedc](https://github.com/DGouron/claude-review-automation/commit/f1aeedcd80e2a0ba1f0dfb0e0ff262afdf70eee2))
* **docs:** add quick start steps and platform badges to landing page ([013b6a1](https://github.com/DGouron/claude-review-automation/commit/013b6a14ba8465d9c1edeead15dba7d1fa63adad))
* **docs:** install VitePress and configure foundation ([5008acc](https://github.com/DGouron/claude-review-automation/commit/5008accaa2f5203d35d49479b7e98aef2197614a))
* **entities:** unify ThreadAction and ReviewContextAction into ReviewAction ([dcece2f](https://github.com/DGouron/claude-review-automation/commit/dcece2fd79a854f6179ef3c45ea1d96c51e89448))
* **gateways:** add GitHubReviewActionCliGateway and backward compat wrappers ([21e269a](https://github.com/DGouron/claude-review-automation/commit/21e269a60567251d460abe4f06ee1dd4a8fbebfe))
* GitHub PR tracking + dashboard UI fixes ([1bccfc1](https://github.com/DGouron/claude-review-automation/commit/1bccfc15eb9af93f9449cac71bfc77930e732d10))
* **main:** complete Composition Root with full feature parity ([3521f89](https://github.com/DGouron/claude-review-automation/commit/3521f89a358ed2d254fb25811f4f95033b02e926))
* **main:** create Composition Root for Clean Architecture ([90ae639](https://github.com/DGouron/claude-review-automation/commit/90ae6390fce460343cf36abcb7b887f32f9db14b))
* **main:** create Composition Root structure ([d8bc0b1](https://github.com/DGouron/claude-review-automation/commit/d8bc0b1e191d9a44f76766bdc9dd67325a071e70))
* **mcp:** add file-based context for MCP server ([9d0c8d6](https://github.com/DGouron/claude-review-automation/commit/9d0c8d6c515cf14cd0517341dee89610946ccb18))
* **mcp:** add file-based logging for MCP server debugging ([ab2739f](https://github.com/DGouron/claude-review-automation/commit/ab2739f264b097941696e65bdd716aacd561dce2))
* **mcp:** add MCP handlers and fix dashboard assignee attribution ([56a561f](https://github.com/DGouron/claude-review-automation/commit/56a561fb8405aba657c68d1d0afe890c08eedd05))
* **mcp:** add MCP server infrastructure with progress gateway ([fdd6d62](https://github.com/DGouron/claude-review-automation/commit/fdd6d6235b80b5c658d4fe22da64d816c16f095e))
* **mcp:** auto-create .mcp.json in project directory ([278144c](https://github.com/DGouron/claude-review-automation/commit/278144c70b8e6ab0d96654009fd0f86dfb83ed47))
* **mcp:** inject authoritative MCP instructions via system prompt ([670cb9d](https://github.com/DGouron/claude-review-automation/commit/670cb9d6b186d0de0b0a5011d5f7e6734bea37dc))
* **mcp:** MCP server infrastructure for real-time review progress ([752474b](https://github.com/DGouron/claude-review-automation/commit/752474bcb80a513b6635ff6b7150bce7a329153c))
* **mcp:** per-job context files and lazy-loading for concurrent reviews ([5be6a23](https://github.com/DGouron/claude-review-automation/commit/5be6a2320e9dc208864ff3ca5f05cedf10a5e253))
* simplify config and add portable launcher ([f6048fa](https://github.com/DGouron/claude-review-automation/commit/f6048fa78d4e87d3473f404a5f38cf6691de9386))
* Standardized review markers with templates and documentation ([c613d7c](https://github.com/DGouron/claude-review-automation/commit/c613d7cb9404b01c060bdd8793f4d739e1ce6738))
* **templates:** add EN/FR skill templates (SPEC-003) ([42add0b](https://github.com/DGouron/claude-review-automation/commit/42add0b3700a6c968f009ff2966095ac0c4bf247))
* **thread-actions:** add standardized review markers parsing and execution ([f4d5353](https://github.com/DGouron/claude-review-automation/commit/f4d5353fbd8bfbbde53bb5d48ab76e102cefa508))
* **webhook:** add label trigger for GitHub reviews ([7a33628](https://github.com/DGouron/claude-review-automation/commit/7a33628940fa4324013630b6e1af19ea2ca75e01))
* **webhook:** add MR tracking for GitHub PRs ([7915bb1](https://github.com/DGouron/claude-review-automation/commit/7915bb128704e2b860819e86379a8f5000fe1aa4))


### Fixed

* address PR [#7](https://github.com/DGouron/claude-review-automation/issues/7) review feedback - configurable polling and websocket tests ([5fcc278](https://github.com/DGouron/claude-review-automation/commit/5fcc278975ae5a5403e18ed323af278f7cdada23))
* address PR review comments ([cf3641a](https://github.com/DGouron/claude-review-automation/commit/cf3641ae316e978d8e77a7d01b5d0c9d2ad3c1a1))
* **build:** update dashboard path in build script ([dafa4d3](https://github.com/DGouron/claude-review-automation/commit/dafa4d3aa5a6d5cabd80de6657ff54c4f2b568d8))
* **dashboard:** correct API status endpoint URL ([048cd84](https://github.com/DGouron/claude-review-automation/commit/048cd84d989e1b75895b8cfdae50b18e47fd11dd))
* **dashboard:** enlarge model card container ([6db215d](https://github.com/DGouron/claude-review-automation/commit/6db215d6f02d4aa03fe5076a52132c87de010f94))
* **dashboard:** fix data mapping and add debug logging ([25cebac](https://github.com/DGouron/claude-review-automation/commit/25cebac53a64074034148358ee712dffd4108c1f))
* **dashboard:** fix model select overflow and project info layout ([6e3b257](https://github.com/DGouron/claude-review-automation/commit/6e3b2577c581079de584a53317d6fc207845036b))
* display stats in dashboard ([2edacd2](https://github.com/DGouron/claude-review-automation/commit/2edacd2de93dde7183bc28a5d62682b9d6f984c1))
* **docs:** correct copyright year to 2026 ([69ba7a9](https://github.com/DGouron/claude-review-automation/commit/69ba7a9f5d2e9253bcf8cb424fbfb237e49ef6b8))
* **docs:** correct copyright year to 2026 ([8448faa](https://github.com/DGouron/claude-review-automation/commit/8448faa6e9fcf91963a5a9e544d3ff52e312e3ef))
* **docs:** correct copyright year to 2026 ([afe694e](https://github.com/DGouron/claude-review-automation/commit/afe694e50b5456ef5c4994747ae66da46cbbfa02))
* **github:** add title and assignedBy to job for dashboard display ([d027356](https://github.com/DGouron/claude-review-automation/commit/d0273562f2df45271eb569b66a6220b2e484bea7))
* **lint:** configure Biome and fix lint errors ([8ef360e](https://github.com/DGouron/claude-review-automation/commit/8ef360e1fd66bea05550b0c2e431beb9e0845cb7))
* **lint:** resolve Biome noDelete and useImportType errors ([9f932b0](https://github.com/DGouron/claude-review-automation/commit/9f932b0fe747599d14e381d2ab4ee08c37df2c08))
* **mcp:** pass env vars via --mcp-config instead of process env ([893c62e](https://github.com/DGouron/claude-review-automation/commit/893c62e1902eba696744776ba4b7f7463d67e937))
* **mcp:** remove --mcp-config and --dangerously-skip-permissions ([4baf630](https://github.com/DGouron/claude-review-automation/commit/4baf6300c305d63823a4f5a28eedf740da8ee210))
* prevent followup from triggering new review + sync threads after followup ([981f49c](https://github.com/DGouron/claude-review-automation/commit/981f49cb7dc220eb971bbadfc3d98076a5a01ddd))
* **progress:** write progress to context file for live dashboard updates ([26ae254](https://github.com/DGouron/claude-review-automation/commit/26ae254a34bdcc31092d8434c49708e624c8ab64))
* support GitHub PR filename format in reviews ([b727822](https://github.com/DGouron/claude-review-automation/commit/b727822b074afb86a41dd4bcc916ed00fd721789))
* **tracking:** warnings should not block MR approval ([45068aa](https://github.com/DGouron/claude-review-automation/commit/45068aa602f47688144ab517c0f4e5a6b6d12922))
* **tracking:** warnings should not block MR approval ([7dc12ef](https://github.com/DGouron/claude-review-automation/commit/7dc12ef8ac18c50a5f4cbc203cf97342daf2fa74))
* **webhook:** add filterGitLabMrMerge to detect merged MRs ([fd33009](https://github.com/DGouron/claude-review-automation/commit/fd33009c44328f24e9298447a6b8b9478758ae3e))
* **webhook:** address PR review feedback - type safety and tests ([0734289](https://github.com/DGouron/claude-review-automation/commit/07342892217ae4cdaaa1bd0f78fbe57f7e7a2cb7))


### Changed

* **arch:** create frameworks layer with Strangler Fig migration ([db54aaa](https://github.com/DGouron/claude-review-automation/commit/db54aaa328266311bc2d75e29265bac5a3aaa90c))
* **entities:** move progress types to domain layer ([7f2c054](https://github.com/DGouron/claude-review-automation/commit/7f2c054c3547860a829afe6532be215da76e2b83))
* **executor:** extract magic number to named constant ([0583f78](https://github.com/DGouron/claude-review-automation/commit/0583f7831bb15a5441a24b34df3cb212ca0bc65c))
* **main:** complete composition root with WebSocket dependencies ([57dfd58](https://github.com/DGouron/claude-review-automation/commit/57dfd58bfdd31ee65526f3987b82a46f3c53b5a5))
* move http routes to interface-adapters/controllers ([5b3b788](https://github.com/DGouron/claude-review-automation/commit/5b3b788f1c546ed3131840d15ac21702a8b41f24))
* move webhooks to interface-adapters/controllers ([d7713ee](https://github.com/DGouron/claude-review-automation/commit/d7713ee31dea893c09bc73286a9514ad9e50111c))
* rename acl/ to adapters/ for Clean Architecture compliance ([cd16b44](https://github.com/DGouron/claude-review-automation/commit/cd16b4479f8427b4cef7dfba3d2ffcaf5b1ceb83))


### Miscellaneous

* **deps:** upgrade to Fastify v5 with compatible plugins ([c1661f7](https://github.com/DGouron/claude-review-automation/commit/c1661f7b726224d36c7466c7582629c8c08fbabf))
* **security:** remove personal config from tracking ([b1d8892](https://github.com/DGouron/claude-review-automation/commit/b1d8892dcf6d142cc4f4728a79ff51ea1a419838))

## [1.0.0] - 2026-02-07

### Added

- **Webhook server** for GitLab merge requests and GitHub pull requests
- **Dual platform support**: GitLab (native webhooks) and GitHub (webhooks + label triggers)
- **Claude CLI integration** with automatic path resolution
- **MCP server** for real-time review progress tracking
- **Real-time dashboard** with WebSocket updates, review history, and per-project tracking
- **Review context files** with live tracking and Claude write capability
- **Review skills system** with EN/FR templates for customizable review prompts
- **Standardized review markers** parsing and execution for thread actions
- **Thread synchronization** between review comments and MR/PR discussions
- **Auto-followup** toggle to re-check resolved issues
- **Auto-cleanup** of tracking data when MR/PR is closed or merged
- **Queue system** with deduplication to prevent concurrent reviews
- **Composition Root** with full dependency injection (Clean Architecture)
- **Gateway pattern** for external service decoupling (GitLab CLI, GitHub CLI)
- **Presenters and value objects** for domain-driven data transformation
- **90+ unit tests** with Vitest
- **GitHub Actions CI** with TypeScript validation, Biome linting, and tests
- **Comprehensive documentation**: architecture, quickstart, config reference, troubleshooting

### Security

- Webhook signature verification with timing-safe comparison
- CLI argument escaping to prevent injection
- No sensitive data in production logs

[1.0.0]: https://github.com/DGouron/claude-review-automation/releases/tag/v1.0.0
