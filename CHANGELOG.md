# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.43.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.42.2...reviewflow-v3.43.0) (2026-07-14)


### Added

* **templates:** add review-advanced and followup-advanced skill templates ([#337](https://github.com/DGouron/review-flow/issues/337)) ([f4aa52e](https://github.com/DGouron/review-flow/commit/f4aa52e77555a13e93492010a8bd165a3bfc6bbd))


### Fixed

* [#339](https://github.com/DGouron/review-flow/issues/339) dashboard loading state stuck after successful fetch ([#340](https://github.com/DGouron/review-flow/issues/340)) ([45bce47](https://github.com/DGouron/review-flow/commit/45bce4789215cb24dd556800932734e3fa6dc0e8))

## [3.42.2](https://github.com/DGouron/review-flow/compare/reviewflow-v3.42.1...reviewflow-v3.42.2) (2026-07-13)


### Fixed

* **claude-invocation:** strip ANSI codes before parsing --bg session id ([#334](https://github.com/DGouron/review-flow/issues/334)) ([88c66e3](https://github.com/DGouron/review-flow/commit/88c66e31b07988b3f275c803722474048e4e82a9))
* **setup:** write the project review-config shape the review engine actually expects ([#333](https://github.com/DGouron/review-flow/issues/333)) ([34c6c8b](https://github.com/DGouron/review-flow/commit/34c6c8b7cd6478f7aa036aca3a8c750ea8865716))

## [3.42.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.42.0...reviewflow-v3.42.1) (2026-07-13)


### Fixed

* **setup:** validate global CLI config in final setup step, not per-project reviews config ([#331](https://github.com/DGouron/review-flow/issues/331)) ([613e719](https://github.com/DGouron/review-flow/commit/613e7192d32d18929404025bf6f28b87f2064c2a))

## [3.42.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.41.0...reviewflow-v3.42.0) (2026-07-01)


### Added

* **dashboard:** dedicated /stats page with volume hero and back nav ([2a10490](https://github.com/DGouron/review-flow/commit/2a1049099327158200602adf513543a4e2caa98c))
* **dashboard:** dedicated /stats page with volume hero and back nav ([20aa61f](https://github.com/DGouron/review-flow/commit/20aa61fa36033c98a09e277a9de7a1421b28e1b9))
* **dashboard:** stats analytics upgrade — date range, code-volume, a11y/DNA, data fixes ([26827d8](https://github.com/DGouron/review-flow/commit/26827d8fdc41fc6d0bfbc5983832580688d15d57))
* **dashboard:** stats analytics upgrade (date range, code-volume, a11y/DNA, data fixes) ([b22a588](https://github.com/DGouron/review-flow/commit/b22a588afda31c449762c2fa25a27f65840ea7c7))
* **tracking:** mark any review as merged regardless of status ([6fb0508](https://github.com/DGouron/review-flow/commit/6fb050800c896558a6e48aba70369a65d9d34ec1))
* **tracking:** mark any review as merged regardless of status (spec-215) ([2ca0695](https://github.com/DGouron/review-flow/commit/2ca0695f2aa9ca08da11ac7297d177e9e48419aa))


### Fixed

* **dashboard:** move project tabs to dedicated full-width line ([#330](https://github.com/DGouron/review-flow/issues/330)) ([43d5bac](https://github.com/DGouron/review-flow/commit/43d5bac11c42471e1944c2f81b42b2a21b326901))
* **docs:** escape angle brackets in spec-209 plan so VitePress builds ([ea447c3](https://github.com/DGouron/review-flow/commit/ea447c32c094421f90e427e93255a99f82d965e0))
* **docs:** unbreak VitePress build (spec-209 plan unclosed tag) ([d6f439d](https://github.com/DGouron/review-flow/commit/d6f439d415f992c07e2eaef5816749879e9e09d6))
* **worktree:** self-heal orphaned dirs flagged as branch-not-found ([#323](https://github.com/DGouron/review-flow/issues/323)) ([1be2fc0](https://github.com/DGouron/review-flow/commit/1be2fc09c87d11e2cf51f530c533efff8bfc1de9))


### Changed

* **dashboard:** retire stats sheet now that /stats page exists ([46c64e7](https://github.com/DGouron/review-flow/commit/46c64e725f3850a5a5d621bea14f5f9503aafef3))
* **dashboard:** retire stats sheet now that /stats page exists ([c36848b](https://github.com/DGouron/review-flow/commit/c36848b5b35ca6f12c4461f0b59ae828c041459f))

## [3.41.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.40.2...reviewflow-v3.41.0) (2026-06-22)


### Added

* **stats:** aggregate commits + lines added/deleted over last 100 MR/PR ([872598d](https://github.com/DGouron/review-flow/commit/872598d381c90907dbea2613a157e3513e2b79d5))

## [3.40.2](https://github.com/DGouron/review-flow/compare/reviewflow-v3.40.1...reviewflow-v3.40.2) (2026-06-22)


### Fixed

* **claude-invocation:** [#318](https://github.com/DGouron/review-flow/issues/318) pin review report to .claude/reviews, forbid bg tmp dir ([#319](https://github.com/DGouron/review-flow/issues/319)) ([fae2f5f](https://github.com/DGouron/review-flow/commit/fae2f5f7c674a2958ff99bbde209fdf2e5383fba))

## [3.40.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.40.0...reviewflow-v3.40.1) (2026-06-22)


### Changed

* **webhook:** SPEC-073 stage 4 — final controller thinning ([#313](https://github.com/DGouron/review-flow/issues/313)) ([1311214](https://github.com/DGouron/review-flow/commit/1311214b6a04972c488c90535f88a2750d927fe8))

## [3.40.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.39.3...reviewflow-v3.40.0) (2026-06-22)


### Added

* **webhook:** guard oversized merge requests (spec-209) ([#316](https://github.com/DGouron/review-flow/issues/316)) ([78e4b0d](https://github.com/DGouron/review-flow/commit/78e4b0da2c5ea45a3b76c4f5f8013a42004dff23))


### Fixed

* **dashboard:** show MR diff stats in the detail sheet from project stats ([49693bd](https://github.com/DGouron/review-flow/commit/49693bd58bbe98fa331dc7b35917a47787e76a18))
* **insights:** reconcile per-developer diff stats from retained review window ([df63172](https://github.com/DGouron/review-flow/commit/df631729fc59be960b6e6b8224617d8651725531))
* **stats:** MR detail diff stats + per-developer diff aggregation ([3470dce](https://github.com/DGouron/review-flow/commit/3470dce66a907c806dd17ca62a1ecfcea6aa562e))

## [3.39.3](https://github.com/DGouron/review-flow/compare/reviewflow-v3.39.2...reviewflow-v3.39.3) (2026-06-20)


### Fixed

* **stats:** self-service backfill via Recalculate button (spec-208) ([#312](https://github.com/DGouron/review-flow/issues/312)) ([807f00d](https://github.com/DGouron/review-flow/commit/807f00daf8c7230176ce7489e3bf6c597cdc2d9b))


### Changed

* **webhook:** add processWebhook orchestrator (spec-073 stage 3) ([52e479f](https://github.com/DGouron/review-flow/commit/52e479f8d156377b47c32cf0e0af715f351967c7))
* **webhook:** processWebhook orchestrator + WebhookEvent union (spec-073 stage 3) ([7b2f856](https://github.com/DGouron/review-flow/commit/7b2f856c8afa53d64d26b81b8e9faf2bf853c075))

## [3.39.2](https://github.com/DGouron/review-flow/compare/reviewflow-v3.39.1...reviewflow-v3.39.2) (2026-06-20)


### Changed

* **webhook:** extract executeReview usecase (spec-073 stage 1) ([6658946](https://github.com/DGouron/review-flow/commit/66589460fbb467dcc239488bc9be2d123fe6f084))

## [3.39.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.39.0...reviewflow-v3.39.1) (2026-06-20)


### Fixed

* **deps:** patch hono, ws, qs, vite advisories via resolutions ([120dec1](https://github.com/DGouron/review-flow/commit/120dec1b98039401e6ad69e7fbe1a48a8591caf2))
* **stats:** real GitLab diff stats + backfill null-poisoned reviews ([03ee814](https://github.com/DGouron/review-flow/commit/03ee814c0900dd43dd982c4ddfb62d53a2c588c7))
* **stats:** real GitLab diff stats + backfill null-poisoned reviews (spec-206, spec-207) ([fa166d9](https://github.com/DGouron/review-flow/commit/fa166d985b109c252853ed6c7a7052ecb41d8ad7))

## [3.39.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.38.0...reviewflow-v3.39.0) (2026-06-20)


### Added

* **analytics:** emit spec-203 bug categories from review skills ([37f8d8b](https://github.com/DGouron/review-flow/commit/37f8d8ba288c3131719e4fec795d501f25f2790d))
* **analytics:** emit spec-203 bug categories from review skills ([1c8c9fd](https://github.com/DGouron/review-flow/commit/1c8c9fdf5f7480ea349698b07f09cb7f7b7493dc))
* **analytics:** implement spec-203 bugs found by category ([b78cee4](https://github.com/DGouron/review-flow/commit/b78cee493da2a1de7015adfd913aca80f1c7a903))
* **analytics:** implement spec-203 bugs found by category ([8eb783b](https://github.com/DGouron/review-flow/commit/8eb783b57bf3e9558a94fa8c8197d419a202ccc4))
* **analytics:** implement spec-204 analytics overview header ([ae0d2c5](https://github.com/DGouron/review-flow/commit/ae0d2c5f5dcb46687300acc782a9fbe55532e32d))
* **analytics:** implement spec-204 analytics overview header ([48864da](https://github.com/DGouron/review-flow/commit/48864da6f158cccc488fdb69eaf4706602f3c36d))
* **analytics:** implement spec-205 key insight cards ([29b1917](https://github.com/DGouron/review-flow/commit/29b19176b7c816d0af328983513c389d831f241f))
* **analytics:** implement spec-205 key insight cards ([54b1ea0](https://github.com/DGouron/review-flow/commit/54b1ea07cf6c70058ca3e9e33f105bcf50dc6dc7))


### Fixed

* **dashboard:** style key insight cards (spec-205) ([b2055f5](https://github.com/DGouron/review-flow/commit/b2055f55d00fa5a5a650290cecdbd5e20e8e9f83))
* **dashboard:** style key insight cards (spec-205) ([a6670b2](https://github.com/DGouron/review-flow/commit/a6670b2b534407ea11848f8237f3bf8c3c92d2ba))


### Changed

* **stats:** split statsService god object into layers (spec-80) ([7e2b73d](https://github.com/DGouron/review-flow/commit/7e2b73d70ddd9067d3582ac8f9f6105bcec5edea))
* **stats:** split statsService god object into layers (spec-80) ([07ec13d](https://github.com/DGouron/review-flow/commit/07ec13daab22bffadf40bee91a132ab566f07a7e))

## [3.38.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.37.1...reviewflow-v3.38.0) (2026-06-18)


### Added

* **ember-chat:** implement spec-193 record recurring insight ([7e409b3](https://github.com/DGouron/review-flow/commit/7e409b3729311d797b140f4c0f393760e663d55c))
* **ember-chat:** implement spec-193 record recurring insight ([94192d8](https://github.com/DGouron/review-flow/commit/94192d8746761e20d6a17c2e9ca97eb0b5a91bbc))

## [3.37.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.37.0...reviewflow-v3.37.1) (2026-06-17)


### Fixed

* **egress:** scan recovery-path output + close SPEC-199 SDD loop ([097dcd6](https://github.com/DGouron/review-flow/commit/097dcd6fe803f6b07052ace5a3724682be16ae88))
* **egress:** scan recovery-path output + close SPEC-199 SDD loop ([79d7df7](https://github.com/DGouron/review-flow/commit/79d7df7210329e7bff25bfdfe78a2b40ee08b1d0))

## [3.37.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.36.1...reviewflow-v3.37.0) (2026-06-15)


### Added

* **platform-integration:** pin followup thread-fetch target (SPEC-196) ([6efdf15](https://github.com/DGouron/review-flow/commit/6efdf1540995877c2d68dba6823b6473851c8115))
* **platform-integration:** pin followup thread-fetch target for SPEC-196 ([0b00749](https://github.com/DGouron/review-flow/commit/0b00749dc33f2166ae29ee1a0c0cc88a0a4f1e02))

## [3.36.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.36.0...reviewflow-v3.36.1) (2026-06-10)


### Fixed

* **setup-wizard:** replace hanging `claude /status` with `claude auth status` ([0f80032](https://github.com/DGouron/review-flow/commit/0f800323c36c3fce6d01d139f543f030e6be3969))


### Changed

* address auto-review findings on oxlint migration ([e933cf8](https://github.com/DGouron/review-flow/commit/e933cf8093e3a7e7742e714c7c6ae15f61401a96))

## [3.36.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.35.0...reviewflow-v3.36.0) (2026-06-02)


### Added

* **settings:** expose trigger mode as a dashboard-editable runtime setting ([6319e2f](https://github.com/DGouron/review-flow/commit/6319e2fadb29cda62f308eadf7b47abb7bf726d1))

## [3.35.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.34.0...reviewflow-v3.35.0) (2026-06-02)


### Added

* **review:** implement spec-202 confirm pending review runs real review ([9fe4cd8](https://github.com/DGouron/review-flow/commit/9fe4cd8221d0f890ae126b98dd425784549b324c))
* **review:** spec-202 confirm pending review runs the real review (+ A-ux double-click guard) ([4e3c645](https://github.com/DGouron/review-flow/commit/4e3c645ff64f3cbf624df2f95e767c8b10bff224))


### Fixed

* [#270](https://github.com/DGouron/review-flow/issues/270) create isolated HOME/config dirs for the scoped GitLab executor ([86729a2](https://github.com/DGouron/review-flow/commit/86729a2da784bdc081a0c8beafe6b154b1bf3a96))
* [#270](https://github.com/DGouron/review-flow/issues/270) create isolated HOME/config dirs for the scoped GitLab executor (ENOENT) ([e77a7bb](https://github.com/DGouron/review-flow/commit/e77a7bbfe5e57b29f10276cf9f1cb6b1437ecb5a))
* [#273](https://github.com/DGouron/review-flow/issues/273) write scoped glab config at GLAB_CONFIG_DIR root (was 401) ([a96ef94](https://github.com/DGouron/review-flow/commit/a96ef9449d32196163971c0a69151df82ae484c4))
* [#273](https://github.com/DGouron/review-flow/issues/273) write scoped glab config at GLAB_CONFIG_DIR root, not a glab-cli subdir ([a53a183](https://github.com/DGouron/review-flow/commit/a53a1837316308d19644d41e5c641f04cbd62d95))
* [#276](https://github.com/DGouron/review-flow/issues/276) shell-quote comment body so the review report posts (no more /bin/sh error) ([dba8a5f](https://github.com/DGouron/review-flow/commit/dba8a5f60b5dbfa9ac3909d5c29d2e4e8b77a398))
* [#276](https://github.com/DGouron/review-flow/issues/276) shell-quote the comment body so the review report can be posted ([68f369d](https://github.com/DGouron/review-flow/commit/68f369dca4e5ef0f7c9e7698ad9656370093f56c))
* **dashboard:** add missing styles for pending review card and actions ([5bf8bf6](https://github.com/DGouron/review-flow/commit/5bf8bf696f2cdf234e30a69ae340b9c0ea914ef2))
* **dashboard:** guard pending review actions against double submit ([edc1256](https://github.com/DGouron/review-flow/commit/edc12566032f2b3e03ae2ea8e5d16e247f87b2c0))
* **dashboard:** style pending review card and confirm/dismiss buttons ([c4a203c](https://github.com/DGouron/review-flow/commit/c4a203c72275b99ce07b05b836235f4c50267451))
* resolve follow-up threads and post GitHub replies in-thread ([4040bd4](https://github.com/DGouron/review-flow/commit/4040bd4d5dee74658a917eb145b3e212d1c34636))
* resolve follow-up threads and post GitHub replies in-thread ([44ca36e](https://github.com/DGouron/review-flow/commit/44ca36e7e4e84a7e76ce16fc57e42989319b8e78))

## [3.34.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.33.0...reviewflow-v3.34.0) (2026-05-30)


### Added

* **insights:** implement spec-191 --bg subscription migration ([5942bc4](https://github.com/DGouron/review-flow/commit/5942bc4b6d6fdc1cb8cc53df2b4a5e7441bbbb38))
* **insights:** implement spec-191 --bg subscription migration ([3ddf2b2](https://github.com/DGouron/review-flow/commit/3ddf2b21452b5efe375032fcef0a825b38dbd326))


### Changed

* **insights:** address auto-review findings (spec-191) ([58325b7](https://github.com/DGouron/review-flow/commit/58325b754ac585fd7adf77a0153499c135aae5c7))

## [3.33.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.32.0...reviewflow-v3.33.0) (2026-05-30)


### Added

* **platform:** implement spec-196..201 webhook/executor platform hardening ([30bce95](https://github.com/DGouron/review-flow/commit/30bce9537dea405e00e5020a66479c65fa40f72e))

## [3.32.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.31.0...reviewflow-v3.32.0) (2026-05-30)


### Added

* **ember:** implement spec-192 on-demand grounding + per-project memory (Phase C) ([e02fa46](https://github.com/DGouron/review-flow/commit/e02fa469b8b8b66be20c08a4f79e957a183c5d8f))
* **ember:** spec-192 on-demand grounding + per-project memory (Phase C) ([c17eb53](https://github.com/DGouron/review-flow/commit/c17eb53c2a72eeac3ab77a73ee91b047618fa05f))


### Fixed

* **ember:** correct stale read-only message and notebook extension (spec-192 self-review) ([9657ec7](https://github.com/DGouron/review-flow/commit/9657ec710908226bc85f4dfcb126c11daf65e83d))

## [3.31.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.30.0...reviewflow-v3.31.0) (2026-05-29)


### Added

* **ember:** echo user message and clear/disable input during answer ([a831339](https://github.com/DGouron/review-flow/commit/a8313396c487b08ad74a520ebf87b7b0d041db10))
* **ember:** implement SPEC-190 live answers via --bg subscription ([3e59692](https://github.com/DGouron/review-flow/commit/3e59692242602bd9e94baf8e28601daea5b72396))
* **ember:** SPEC-190 live answers via Claude subscription + chat UX ([dd3c35d](https://github.com/DGouron/review-flow/commit/dd3c35dbb2cae75943a7b607ed735cba4d2936bb))
* **ember:** sticky header, markdown answers, typing/answered animations ([401f534](https://github.com/DGouron/review-flow/commit/401f5344319c6801ec72171ad8cecae57bbf4338))


### Fixed

* **ember:** contain wide content (inline code, pre, tables) in chat bubble ([586b9b3](https://github.com/DGouron/review-flow/commit/586b9b3673362a5aefb0d3c75bb15679c6e4e762))
* **ember:** correct --bg transcript tail and done-detection (SPEC-190) ([8f71836](https://github.com/DGouron/review-flow/commit/8f718361b68aa9eb9a1800298690dd3bde30c127))
* **ember:** guard extractText against non-array message content (SPEC-190) ([af3d9e5](https://github.com/DGouron/review-flow/commit/af3d9e53f45318a67329051d4daad47bef86766f))

## [3.30.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.29.0...reviewflow-v3.30.0) (2026-05-28)


### Added

* **dashboard:** SPEC-189 Ember flame wireframe avatar + sidebar layout ([#248](https://github.com/DGouron/review-flow/issues/248)) ([7e82a2f](https://github.com/DGouron/review-flow/commit/7e82a2fb385c8990558e3fd15e103b2e8bbd40e7))

## [3.29.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.28.0...reviewflow-v3.29.0) (2026-05-28)


### Added

* **dashboard:** SPEC-189 Ember read-only review chat (Phase A) ([#244](https://github.com/DGouron/review-flow/issues/244)) ([4e0d5b9](https://github.com/DGouron/review-flow/commit/4e0d5b9bb37a68cc2c91454412a35ce34107f1ed))


### Fixed

* **docs:** unblock vitepress build and refresh setup-wizard docs ([83ce3bb](https://github.com/DGouron/review-flow/commit/83ce3bbbea6e80851742c8af08cfbb912bdc66d5))
* **docs:** unblock vitepress build and refresh setup-wizard docs ([fc5896d](https://github.com/DGouron/review-flow/commit/fc5896d14cc378d51bf17c9f51ebc01360cbc6bb))

## [3.28.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.27.0...reviewflow-v3.28.0) (2026-05-28)


### Added

* **dashboard:** setup wizard HUD (SPEC-184 iteration A) ([#235](https://github.com/DGouron/review-flow/issues/235)) ([3cc3755](https://github.com/DGouron/review-flow/commit/3cc3755f019573f869a133c7cd1aae7e1b355ad4))
* **dashboard:** spec-188 wizard wireframe avatar (phase 1) ([#240](https://github.com/DGouron/review-flow/issues/240)) ([98b0bfd](https://github.com/DGouron/review-flow/commit/98b0bfd5d1bf6227ddcb47595ae2d9ffec5f42cc))
* **setup-wizard:** SPEC-183 setup wizard CLI orchestrator ([#233](https://github.com/DGouron/review-flow/issues/233)) ([4d9d0d3](https://github.com/DGouron/review-flow/commit/4d9d0d3be624a7c63d92d4e422f1e58515aeed4e))
* **setup-wizard:** SPEC-184 Iteration B — dashboard wizard interactive forms ([#238](https://github.com/DGouron/review-flow/issues/238)) ([806515b](https://github.com/DGouron/review-flow/commit/806515b4a69efbfaf8022185e545393dc7525623))
* **setup-wizard:** SPEC-187 read wizard answers from stdin in JSON mode ([#237](https://github.com/DGouron/review-flow/issues/237)) ([8476550](https://github.com/DGouron/review-flow/commit/8476550edbfce72743e882e2c4a907d60c5ab9a4))


### Fixed

* **worktree:** drop false-positive missing-build-artifacts signal ([#239](https://github.com/DGouron/review-flow/issues/239)) ([41a3a79](https://github.com/DGouron/review-flow/commit/41a3a79b5bec924f895ebfa35197d003fde95dd3))

## [3.27.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.26.0...reviewflow-v3.27.0) (2026-05-27)


### Added

* **queue:** cap parallel reviews per project (spec-183) ([#229](https://github.com/DGouron/review-flow/issues/229)) ([f01bca6](https://github.com/DGouron/review-flow/commit/f01bca6af0151a7c05abe6f18a059954187a8675))
* **queue:** persist job history to disk (SPEC-176) ([#227](https://github.com/DGouron/review-flow/issues/227)) ([8310453](https://github.com/DGouron/review-flow/commit/8310453dbc4d34e160398bfde0f7068286f21745))
* **stats:** implement SPEC-47 capture git diff stats ([#226](https://github.com/DGouron/review-flow/issues/226)) ([7a4f65c](https://github.com/DGouron/review-flow/commit/7a4f65cc906b243a6fab2aa1f8e618a61e0c0331))
* **worktree:** implement SPEC-175 worktree failure visibility & force-cleanup ([#230](https://github.com/DGouron/review-flow/issues/230)) ([964a43d](https://github.com/DGouron/review-flow/commit/964a43d3b0c240fdd1143076150515e848ac498d))

## [3.26.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.25.0...reviewflow-v3.26.0) (2026-05-27)


### Added

* **dashboard:** make now lane collapsible ([#225](https://github.com/DGouron/review-flow/issues/225)) ([7c895ba](https://github.com/DGouron/review-flow/commit/7c895bacb79637b0116198a2fdc74d6cf75f9fe5))

## [3.25.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.24.2...reviewflow-v3.25.0) (2026-05-27)


### Added

* **dashboard:** restructure empty states and promote team section ([#222](https://github.com/DGouron/review-flow/issues/222)) ([493cd8a](https://github.com/DGouron/review-flow/commit/493cd8a30f0b25fbc7f2b1ae0c6e42393713fd79))
* **tracking:** allow manual mark-as-merged from pending-fix ([#224](https://github.com/DGouron/review-flow/issues/224)) ([f4cf64d](https://github.com/DGouron/review-flow/commit/f4cf64d03c9d121d9462462ca9f32090d1e915f6))


### Fixed

* **settings:** persist runtime settings across restarts ([#221](https://github.com/DGouron/review-flow/issues/221)) ([f8a71b8](https://github.com/DGouron/review-flow/commit/f8a71b8dbcf3ae16557b219131cdc8f08a4e9d65))

## [3.24.2](https://github.com/DGouron/review-flow/compare/reviewflow-v3.24.1...reviewflow-v3.24.2) (2026-05-27)


### Fixed

* **followup:** resolve sourceBranch from TrackedMr instead of 'unknown' ([#219](https://github.com/DGouron/review-flow/issues/219)) ([fa23616](https://github.com/DGouron/review-flow/commit/fa23616402f49e9ced39fa81491bf77faab857ef))

## [3.24.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.24.0...reviewflow-v3.24.1) (2026-05-26)


### Fixed

* **claude-invocation:** fall back to worktree root when looking up review report ([#217](https://github.com/DGouron/review-flow/issues/217)) ([3ea9dba](https://github.com/DGouron/review-flow/commit/3ea9dbac979f90830b6a88e59f803e1819e7fc46))

## [3.24.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.23.0...reviewflow-v3.24.0) (2026-05-26)


### Added

* **dashboard:** expose qualityThreshold in settings + read-only display ([#214](https://github.com/DGouron/review-flow/issues/214)) ([2d65635](https://github.com/DGouron/review-flow/commit/2d65635b1a24d4d6e30b52f79c21d1ab131e5cf8))
* **dashboard:** rich, interactive desktop notifications ([#213](https://github.com/DGouron/review-flow/issues/213)) ([3c2580a](https://github.com/DGouron/review-flow/commit/3c2580a104147da67c7bd71bd943a47f9f6517b2))


### Fixed

* **worktree:** preserve sub-path between localPath and gitRoot when launching Claude ([#216](https://github.com/DGouron/review-flow/issues/216)) ([b4867c8](https://github.com/DGouron/review-flow/commit/b4867c8c8809dd93e72980357aad309cdd82e1e6))

## [3.23.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.22.0...reviewflow-v3.23.0) (2026-05-26)


### Added

* **tracking:** block approval below quality threshold (SPEC-180 iter A) ([#209](https://github.com/DGouron/review-flow/issues/209)) ([9b1f4ca](https://github.com/DGouron/review-flow/commit/9b1f4ca9b40df65b612176465014592f7aab9a73))
* **tracking:** comment-based bypass for quality gate (SPEC-180 iter B) ([#211](https://github.com/DGouron/review-flow/issues/211)) ([77e6356](https://github.com/DGouron/review-flow/commit/77e6356c2780f6300cd6a127f170a282ba72c4e0))
* **tracking:** platform unapprove + FR comment on non-qualified MR (SPEC-180 iter C) ([#212](https://github.com/DGouron/review-flow/issues/212)) ([35c5e32](https://github.com/DGouron/review-flow/commit/35c5e320bb8879fc26d14253be4071de0d08d78b))

## [3.22.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.21.0...reviewflow-v3.22.0) (2026-05-25)


### Added

* **dashboard:** operator's console redesign + animations ([#204](https://github.com/DGouron/review-flow/issues/204)) ([8b33ebd](https://github.com/DGouron/review-flow/commit/8b33ebd28bc09a85280371c499f68d73927eb18e))

## [3.21.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.20.0...reviewflow-v3.21.0) (2026-05-25)


### Added

* **dashboard:** project CRUD + tabs reposition + settings modal ([#202](https://github.com/DGouron/review-flow/issues/202)) ([d3dfa7b](https://github.com/DGouron/review-flow/commit/d3dfa7bd61717ebe376d704870642a44d6d3d34d))

## [3.20.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.19.2...reviewflow-v3.20.0) (2026-05-25)


### Added

* **dashboard:** implement SPEC-91 multi-project overview UI ([#200](https://github.com/DGouron/review-flow/issues/200)) ([05b1952](https://github.com/DGouron/review-flow/commit/05b1952617cbe2ed7d11953eb28aa37c53a14fae))

## [3.19.2](https://github.com/DGouron/review-flow/compare/reviewflow-v3.19.1...reviewflow-v3.19.2) (2026-05-24)


### Changed

* **cli:** split SPEC-92 god file into per-command modules ([#198](https://github.com/DGouron/review-flow/issues/198)) ([3d3d8e8](https://github.com/DGouron/review-flow/commit/3d3d8e86da6a7d94d315bb503dd3b9e11c28e7cd))

## [3.19.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.19.0...reviewflow-v3.19.1) (2026-05-24)


### Fixed

* **claude-invocation:** tolerate missing report on followup jobs ([#194](https://github.com/DGouron/review-flow/issues/194)) ([bfd1419](https://github.com/DGouron/review-flow/commit/bfd1419140bb354caa6b5271975756e7006fca6f))

## [3.19.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.18.0...reviewflow-v3.19.0) (2026-05-24)


### Added

* **review-execution:** add SPEC-174 semi-auto trigger mode ([#188](https://github.com/DGouron/review-flow/issues/188)) ([4971431](https://github.com/DGouron/review-flow/commit/497143115432a7be92d7bfd62fdf124e994d2875))

## [3.18.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.17.1...reviewflow-v3.18.0) (2026-05-23)


### Added

* **dashboard:** sidebar layout + Claude economics accordion ([#191](https://github.com/DGouron/review-flow/issues/191)) ([73f8b29](https://github.com/DGouron/review-flow/commit/73f8b29ce2678a6d67b78ee6da9ebbc72e95f402))
* **review-focus:** implement SPEC-48 (front/back/fullstack/doc) ([#189](https://github.com/DGouron/review-flow/issues/189)) ([d494b8f](https://github.com/DGouron/review-flow/commit/d494b8fcb3cb6046525a8232ae362a8013c7e916))

## [3.17.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.17.0...reviewflow-v3.17.1) (2026-05-23)


### Fixed

* [#171](https://github.com/DGouron/review-flow/issues/171) trigger followup review on push to reviewed branch ([#190](https://github.com/DGouron/review-flow/issues/190)) ([340da66](https://github.com/DGouron/review-flow/commit/340da665b556e434d70bf4c9cf0ee756f8346bea))

## [3.17.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.16.0...reviewflow-v3.17.0) (2026-05-23)


### Added

* **dashboard:** implement spec-173 worktree panel ([#184](https://github.com/DGouron/review-flow/issues/184)) ([bcab671](https://github.com/DGouron/review-flow/commit/bcab671a6c0705d38be6468b3b4cb06d31c6d07f))
* **review:** add Clean Code as 7th audit in review-front and follow-up ([#185](https://github.com/DGouron/review-flow/issues/185)) ([8f2e230](https://github.com/DGouron/review-flow/commit/8f2e230fbfc6b6a7d8ad04b2b8d59365a9e748b1))

## [3.16.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.15.0...reviewflow-v3.16.0) (2026-05-23)


### Added

* **worktree-management:** implement SPEC-170 FR-6 daily sweep + FR-8 GitHub cross-fork PR ([#181](https://github.com/DGouron/review-flow/issues/181)) ([eecc12b](https://github.com/DGouron/review-flow/commit/eecc12b2a651394d3e8c63b0cf108c2dca358c31))


### Fixed

* **claude-invocation:** add -- terminator so variadic tool flags do not swallow the prompt arg ([#183](https://github.com/DGouron/review-flow/issues/183)) ([34f11fe](https://github.com/DGouron/review-flow/commit/34f11fe7b43d3c93da181d6315ac6403065038ba))

## [3.15.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.14.0...reviewflow-v3.15.0) (2026-05-23)


### Added

* **claude-invocation:** re-enable token usage tracking in --bg mode ([#179](https://github.com/DGouron/review-flow/issues/179)) ([ec6f8ea](https://github.com/DGouron/review-flow/commit/ec6f8ea37daad221d1786a3b13749e18afbb51c1))

## [3.14.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.13.0...reviewflow-v3.14.0) (2026-05-23)


### Added

* **supervisor-management:** implement SPEC-172 claude agents supervisor lifecycle ([#176](https://github.com/DGouron/review-flow/issues/176)) ([e997c20](https://github.com/DGouron/review-flow/commit/e997c20d3bcb367a836495911ed2f22b289d34f2))
* **worktree-management:** implement SPEC-170 worktree lifecycle (partial — FR-6 and FR-8 follow-up) ([#175](https://github.com/DGouron/review-flow/issues/175)) ([0474587](https://github.com/DGouron/review-flow/commit/0474587fa4ef25ae1d2ca71cf46ee4c68edb0045))


### Changed

* **claude-invocation:** switch permission mode from bypassPermissions to auto ([#177](https://github.com/DGouron/review-flow/issues/177)) ([42b9298](https://github.com/DGouron/review-flow/commit/42b929821770c09929ddb73fb50638b8c1a8ecab))

## [3.13.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.12.0...reviewflow-v3.13.0) (2026-05-22)


### Added

* **claude-invocation:** implement spec-169 migrate claude -p to --bg mode ([#170](https://github.com/DGouron/review-flow/issues/170)) ([f3e408a](https://github.com/DGouron/review-flow/commit/f3e408af03056bb23017b29b62d811a25e62fb67))

## [3.12.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.11.0...reviewflow-v3.12.0) (2026-05-20)


### Added

* **webhook:** implement spec-46 github followup review on push ([#165](https://github.com/DGouron/review-flow/issues/165)) ([379ec4a](https://github.com/DGouron/review-flow/commit/379ec4aa33560eb6cf2767e85386554575161ec0)), closes [#46](https://github.com/DGouron/review-flow/issues/46)


### Fixed

* [#156](https://github.com/DGouron/review-flow/issues/156) detect source-checkout installs to stop the false dashboard update flow ([#166](https://github.com/DGouron/review-flow/issues/166)) ([4c48038](https://github.com/DGouron/review-flow/commit/4c480383d33205d8e2f3b38e0066225aafd2cf62))

## [3.11.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.10.1...reviewflow-v3.11.0) (2026-05-20)


### Added

* **token-accounting:** monthly Claude budget cap with live indicator ([#164](https://github.com/DGouron/review-flow/issues/164)) ([5b87047](https://github.com/DGouron/review-flow/commit/5b87047c463b4c8d0351508fcac0d5bf7cb8eea9))


### Changed

* v4 Phase 2 Batch A — DDD hot spots + Shiplens tooling + Token Usage feature ([#162](https://github.com/DGouron/review-flow/issues/162)) ([e0d4100](https://github.com/DGouron/review-flow/commit/e0d4100ebfeea88e7c22ed2955b0837fd503145d))

## [3.10.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.10.0...reviewflow-v3.10.1) (2026-05-19)


### Fixed

* remove unused join import breaking the build ([#154](https://github.com/DGouron/review-flow/issues/154)) ([1f802ee](https://github.com/DGouron/review-flow/commit/1f802ee50534f3661bf07f07df773f1f793ab17b))


### Changed

* v4 — extract 8 bounded contexts into src/modules/ (Phase 1) ([#157](https://github.com/DGouron/review-flow/issues/157)) ([e26de0e](https://github.com/DGouron/review-flow/commit/e26de0ed31388985403a0457fcb2d93b4e284de3))

## [3.10.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.9.0...reviewflow-v3.10.0) (2026-05-14)


### Added

* add hybrid model routing and token usage tracking ([#147](https://github.com/DGouron/review-flow/issues/147)) ([2479b43](https://github.com/DGouron/review-flow/commit/2479b43c33d234a1d1ae787284cfb8d3763458bb))
* **harness:** bring harness + SDD to Shiplens parity ([#150](https://github.com/DGouron/review-flow/issues/150)) ([6ba6684](https://github.com/DGouron/review-flow/commit/6ba668468268368843feb36d2dd7eadf0a61efcc))

## [3.9.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.8.1...reviewflow-v3.9.0) (2026-04-03)


### Added

* **harness:** add SDD+TDD double loop with deterministic hooks ([793c8d8](https://github.com/DGouron/review-flow/commit/793c8d8d0c38ba88c770e0a5971fb670e4209ae9))
* **harness:** add SDD+TDD double loop with deterministic hooks ([9a9a25a](https://github.com/DGouron/review-flow/commit/9a9a25af7925da8518ae53ebe5362a0a6743981f))

## [3.8.1](https://github.com/DGouron/review-flow/compare/reviewflow-v3.8.0...reviewflow-v3.8.1) (2026-03-16)


### Fixed

* **docs:** escape angle bracket placeholders in spec files ([e82ff68](https://github.com/DGouron/review-flow/commit/e82ff688a5ce9e556d01a94369ac14b4598bfa2c))

## [3.8.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.7.0...reviewflow-v3.8.0) (2026-03-16)


### Added

* developer & team insights with AI analysis ([ca9b6ae](https://github.com/DGouron/review-flow/commit/ca9b6aef1b6191b1cd32e135138c12ad0112f57f))


### Fixed

* self-update mechanism, stats cap, auto-review fixes and docs ([2c69c6d](https://github.com/DGouron/review-flow/commit/2c69c6daac18c82ebd7913cbb063f2754f10783a))

## [3.7.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.6.0...reviewflow-v3.7.0) (2026-03-15)


### Added

* capture git diff stats per review (commits, additions, deletions) ([111b77f](https://github.com/DGouron/review-flow/commit/111b77f921a97df1ab9ffeea9cf6fee638cd4246))
* capture git diff stats per review (commits, additions, deletions) ([fd4d753](https://github.com/DGouron/review-flow/commit/fd4d753a715aa25c73c8baa4c7c9824a0d793f22)), closes [#47](https://github.com/DGouron/review-flow/issues/47)
* **cleanup:** add review file retention policy with scheduled cleanup ([c2baea8](https://github.com/DGouron/review-flow/commit/c2baea8856bb0be72b46a99d68f724bf7b230215))
* **cleanup:** review file retention policy with scheduled cleanup ([56f4e6c](https://github.com/DGouron/review-flow/commit/56f4e6c32c9f54b8e7f673177a5e67cadfc05a10))
* **dashboard:** add version update checker with self-update capability ([715d8ae](https://github.com/DGouron/review-flow/commit/715d8aed7ff39cb1f86edf0a8e33814c2fa728fc))
* **dashboard:** canvas charts and animated counters in stats section ([abcf1af](https://github.com/DGouron/review-flow/commit/abcf1af3d6b07533aed1f0db1f834edecb44b426))
* **dashboard:** collapsible lists for long MR lanes ([eba2441](https://github.com/DGouron/review-flow/commit/eba2441ba0f5768c44fd76979fe62641d439517a))
* **dashboard:** diff stats in MR sheet + score trend per developer ([9235e0c](https://github.com/DGouron/review-flow/commit/9235e0c88392c2521edb0b2015387024843f925a))
* **dashboard:** logs open in side sheet instead of inline section ([7737782](https://github.com/DGouron/review-flow/commit/773778259561f3d5b1108316b8d68d2acc06344e))
* **dashboard:** logs sheet takes full height with sticky clear button ([632e2f2](https://github.com/DGouron/review-flow/commit/632e2f20f1ecb9f6377d77dd80ce5c91dd98b851))
* **dashboard:** MR detail side sheet with canvas graphs ([bbb6065](https://github.com/DGouron/review-flow/commit/bbb6065945eda10a7092d9c304e764d88fa2a372))
* **dashboard:** sticky action footer in MR sheet with approve button ([48041fe](https://github.com/DGouron/review-flow/commit/48041fe5bec7c43a43433a276c8147b9b6f96c4d))
* **dashboard:** version update checker with self-update ([37f7ee4](https://github.com/DGouron/review-flow/commit/37f7ee48fff96adc69a64a9c44998a01681eca79))
* stats recalculate button with diff stats backfill ([fa04c7c](https://github.com/DGouron/review-flow/commit/fa04c7c7f7be15c6a2ba416c9cc991bd5c45248a))
* stats recalculate button with diff stats backfill ([7df16cf](https://github.com/DGouron/review-flow/commit/7df16cf8a360d814713c4c3f2281dc410f880b2f))


### Fixed

* address auto-review findings (null over undefined, port→gateway naming) ([c81937a](https://github.com/DGouron/review-flow/commit/c81937a5b9f64225077cc981d5b5c56c0f73ffb1))
* address PR [#124](https://github.com/DGouron/review-flow/issues/124) review — architecture and code quality ([2b9b577](https://github.com/DGouron/review-flow/commit/2b9b5775361bd521a62ef86e692f6e29357c2c4f))
* **dashboard:** auto-populate project selector from server config ([3c68e22](https://github.com/DGouron/review-flow/commit/3c68e22321660578b0805e74a61f5553b9e75dca))

## [3.6.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.5.0...reviewflow-v3.6.0) (2026-03-14)


### Added

* add product-manager skill to feature-planner agent ([6ac68f9](https://github.com/DGouron/review-flow/commit/6ac68f9c806fc353087f54413bc233d7b22eb2d2))
* add skills, agents, and rules for spec-driven development ([43cec38](https://github.com/DGouron/review-flow/commit/43cec3863ab20adc454f45a9015117a5b3da5ecf))
* add skills, agents, and rules for spec-driven development pipeline ([1abcdb7](https://github.com/DGouron/review-flow/commit/1abcdb780b537bfa29670310e71e4ec0ae9ffe17))
* enrich review comments with clickable file:line links ([1c0c090](https://github.com/DGouron/review-flow/commit/1c0c0902abcef0024b299f22f224b3b86c51e762))
* enrich review comments with clickable file:line links ([604c6cc](https://github.com/DGouron/review-flow/commit/604c6cc57d1d29d6fc4f407d1225ad4d6cd3b3c9))
* **invoker:** add critical data source rules to MCP system prompt ([f7d5367](https://github.com/DGouron/review-flow/commit/f7d53679040a83dd6f11382c6b8560c3ce693410))
* translate all skills to English and remove external project references ([ee40c4f](https://github.com/DGouron/review-flow/commit/ee40c4ff0d6c03e4f34c0086bc23ac16e4bb2593))


### Fixed

* address MR [#106](https://github.com/DGouron/review-flow/issues/106) review feedback ([cff187a](https://github.com/DGouron/review-flow/commit/cff187a13f4e433f52285fa7838e2437ceaaf595))
* isolate review MCP config from project .mcp.json ([fdfd696](https://github.com/DGouron/review-flow/commit/fdfd69657b3ebbba76c8dd62f2b9b62051e08d2b))
* isolate review MCP config from project .mcp.json ([1dd2531](https://github.com/DGouron/review-flow/commit/1dd25315e830a5aa291a8968e7a82b667d7fdc09))
* remove dead ensureProjectMcpConfig and fix relative import ([29f8f63](https://github.com/DGouron/review-flow/commit/29f8f637ca27804471eb317439a19556ac580ddb))
* remove React/frontend references from review skills ([2a12a94](https://github.com/DGouron/review-flow/commit/2a12a944110df6c64567fe85bd0ed11707c83a47))
* resolve CI lint failure and clean up type assertion ([8c45fe6](https://github.com/DGouron/review-flow/commit/8c45fe6a3113388e3625af797fa4124ae1c2560c))


### Changed

* **github-controller:** inject dependencies via GitHubWebhookDependencies ([8131162](https://github.com/DGouron/review-flow/commit/81311629e2c2d0d9b241ab23bcb34cee7ab2a981)), closes [#74](https://github.com/DGouron/review-flow/issues/74)
* **gitlab-controller:** inject ReviewContextGateway via deps parameter ([619c95c](https://github.com/DGouron/review-flow/commit/619c95c28bac047ece3761a00bef8a81459ec154)), closes [#74](https://github.com/DGouron/review-flow/issues/74)
* **gitlab-controller:** inject ThreadFetchGateway and DiffMetadataFetchGateway via deps ([04438a9](https://github.com/DGouron/review-flow/commit/04438a9c2b1e4940f24a7cce18bd824002a8d698))
* **gitlab-controller:** inject use cases and migrate all imports to @/ alias ([bbc3598](https://github.com/DGouron/review-flow/commit/bbc3598d38119056a48c2acfd640607833362aed))
* implement dependency injection in controllers ([4fed43e](https://github.com/DGouron/review-flow/commit/4fed43ee8e0d0fceab95baf14c6b3d507e038ba2))
* inject gateways and use cases in GitLab webhook controller ([#74](https://github.com/DGouron/review-flow/issues/74)) ([f6314ab](https://github.com/DGouron/review-flow/commit/f6314abfd279eccf574ee6292b00f4c0d97bf4ef))

## [3.5.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.4.0...reviewflow-v3.5.0) (2026-02-15)


### Added

* **cli:** add `reviewflow discover` command for repository discovery ([#53](https://github.com/DGouron/review-flow/issues/53)) ([6e90e12](https://github.com/DGouron/review-flow/commit/6e90e128600c28875e815068079c84efd0f4a160))
* **cli:** add reviewflow discover command ([395b4a2](https://github.com/DGouron/review-flow/commit/395b4a2f0795e62403c99a6b78f6d444e0805160))
* **cli:** refactor executeInit with dependency injection and prerequisites check ([#29](https://github.com/DGouron/review-flow/issues/29)) ([425e4e1](https://github.com/DGouron/review-flow/commit/425e4e1f23b6476aea83935ee7611d72a986734c))
* **dashboard:** deliver night-shift calm UX refinement and actionable review focus ([8b9d699](https://github.com/DGouron/review-flow/commit/8b9d699efe39a14965f8923b62212c76c9f1b319))
* **dashboard:** extract utility modules and add i18n support ([dfae1d3](https://github.com/DGouron/review-flow/commit/dfae1d317d007e654800133af87338fc7cd76e24))
* **dashboard:** extract utility modules and add i18n support ([#69](https://github.com/DGouron/review-flow/issues/69)) ([3df84fd](https://github.com/DGouron/review-flow/commit/3df84fdc06790f1ebef8ac6a3d8462c0513e13f0))
* **dashboard:** finalize priority UX, notifications, and responsive polish ([75f6e84](https://github.com/DGouron/review-flow/commit/75f6e8429576efa5e96d989152870a991e7e21e1))
* **dashboard:** finalize priority-first UX and notifications ([909b7f5](https://github.com/DGouron/review-flow/commit/909b7f500189cd4e74fdbfda3015a4700c27459b))
* **dashboard:** polish stats panel hierarchy and mobile density ([8c0ef37](https://github.com/DGouron/review-flow/commit/8c0ef371b333ab564c0524efa50f66de8bf7433c))
* **dashboard:** refine project stats panel visual hierarchy ([fdfe792](https://github.com/DGouron/review-flow/commit/fdfe7928cdfe5d2be56dc51240a395cd5976bc07))
* **i18n:** add internationalization support FR/EN ([#45](https://github.com/DGouron/review-flow/issues/45)) ([c41f4fe](https://github.com/DGouron/review-flow/commit/c41f4fe56364abf3934458e7dcc108902f3c73a0))
* **i18n:** internationalization support FR/EN ([b7cfcc1](https://github.com/DGouron/review-flow/commit/b7cfcc102e0c6739516f1d3837bf1686048ea2ac))


### Fixed

* **cli:** address auto-review blocking and important corrections ([#53](https://github.com/DGouron/review-flow/issues/53)) ([b68951a](https://github.com/DGouron/review-flow/commit/b68951a573a3380aab707b06fa05d425157d7839))
* **dashboard:** harden rendered data and resolve follow-up assignee ([2336a9c](https://github.com/DGouron/review-flow/commit/2336a9ce6e48e7e4e21a370517303fa02c0ba2a1))

## [3.4.0](https://github.com/DGouron/review-flow/compare/reviewflow-v3.3.1...reviewflow-v3.4.0) (2026-02-13)


### Added

* **cli:** add post-write validation for MCP server configuration ([#54](https://github.com/DGouron/review-flow/issues/54)) ([8bb049c](https://github.com/DGouron/review-flow/commit/8bb049cf87c6251179416b370b61aacb684ad5b8))
* **cli:** automatic MCP server configuration validation ([ce8ad3c](https://github.com/DGouron/review-flow/commit/ce8ad3cd11ed167819bce402622a4d1cbec81ebb))


### Changed

* **cli:** use createGuard, separate schema, fix test mocks ([#54](https://github.com/DGouron/review-flow/issues/54)) ([cf6f54a](https://github.com/DGouron/review-flow/commit/cf6f54a22bcf9969b9293ef2dff40b643da48977))

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
