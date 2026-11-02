# Obsidian NotePages — Antigravity Development Prompts

> Bộ prompt điều phối Antigravity phát triển plugin Obsidian NotePages theo từng Phase. Chỉ làm một Phase mỗi lần; kiểm thử và chờ xác nhận trước khi chuyển tiếp.

## Cách sử dụng

1. Mở repository/workspace của plugin trong Antigravity.
2. Đưa file này vào workspace.
3. Gửi **Prompt khởi động** bên dưới.
4. Thực hiện Phase 0, duyệt TDD, sau đó lần lượt gửi prompt Phase 1–9.
5. Không gửi tất cả Phase cùng lúc.

## Prompt khởi động — Project Instructions

```text
Bạn là Principal Software Architect, Senior TypeScript Engineer và Obsidian Plugin Developer của dự án Obsidian NotePages.

Đọc toàn bộ PROMPT.md. Sản phẩm là plugin ghi chép nhiều trang cho Obsidian, lấy cảm hứng từ Goodnotes/Notability: fixed-size pages (A4/Letter/custom), continuous vertical scrolling, stylus handwriting, pen/highlighter/eraser, lasso, shape recognition, text, images, PDF annotation, Obsidian Wikilinks, local-first storage và PDF/PNG/SVG export. Đây KHÔNG phải infinite canvas.

Quy tắc bắt buộc:
- Phân tích repository, Git status, cấu trúc, package manager và code hiện tại trước khi sửa.
- Dùng TypeScript strict mode và Obsidian Plugin API; kiểm tra tài liệu/API hiện hành thay vì đoán.
- Tách document model, rendering, input, storage và UI thành module có trách nhiệm rõ ràng.
- Tọa độ nội dung độc lập với zoom/viewport; object có stable ID; document có schema version.
- Có validate, serialize, deserialize, migration, autosave và recovery.
- Không ghi đè hoặc xóa dữ liệu người dùng khi chưa được phép.
- Không thêm dependency khi chưa giải thích lý do.
- Không dùng placeholder cho acceptance criteria.
- Không tự ý đổi kiến trúc đã duyệt.

Trước mỗi Phase: inspect code, xác định phạm vi, file dự kiến sửa/tạo, dependency và rủi ro; nêu kế hoạch trước khi code.
Trong mỗi Phase: chỉ làm đúng phạm vi được giao; không tự chuyển Phase.
Sau mỗi Phase: chạy typecheck/lint/tests/build phù hợp; ghi chính xác command và kết quả; cung cấp hướng dẫn kiểm thử Obsidian; liệt kê file tạo/sửa, giới hạn và acceptance criteria.

Mặc định trao đổi bằng tiếng Việt, giữ nguyên tên API và thuật ngữ kỹ thuật tiếng Anh.

Ngay bây giờ bắt đầu Phase 0 theo PROMPT.md. Chưa viết code. Tạo Technical Design Document và dừng lại chờ tôi phê duyệt.
```

## Roadmap

| Phase | Nội dung | Kết quả |
|---|---|---|
| 0 | Architecture & Technical Design | TDD, quyết định kiến trúc, roadmap |
| 1 | Project Scaffolding | Plugin build và chạy trong Obsidian |
| 2 | Notebook, Page & Paper Rendering | Trang cố định, multi-page, templates |
| 3 | Digital Inking Engine | Pointer input, pen, highlighter, eraser |
| 4 | Selection & Editing | Lasso, transform, shapes, undo/redo |
| 5 | Serializer & Storage | Schema, save, autosave, recovery |
| 6 | Advanced Note-taking | Text, image, Wikilinks, PDF background |
| 7 | Export Engine | PDF, PNG, SVG |
| 8 | Performance Engineering | Profiling, rendering và memory optimization |
| 9 | QA & Release | Kiểm thử, tài liệu, release readiness |

---

## PHASE 0 — Architecture & Technical Design

```text
Thực hiện Phase 0. Không viết code triển khai.

1. Phân loại functional, non-functional, performance, compatibility và data-integrity requirements. Phát hiện yêu cầu thiếu/mâu thuẫn.
2. So sánh Canvas 2D, SVG, Hybrid Canvas+SVG+DOM, perfect-freehand, Pointer Events/getCoalescedEvents, Vault storage, IndexedDB và thư viện PDF. Với mỗi lựa chọn nêu ưu/nhược điểm, hiệu năng, độ phức tạp, hỗ trợ nền tảng. Xác minh API và khả năng thực tế.
3. Thiết kế module: Plugin Core, Notebook Manager, Page Manager, Document Model, Rendering Engine, Inking Engine, Input Manager, Selection Engine, History Manager, Serializer, Storage Manager, Asset Manager, Export Engine, Obsidian Integration, Settings/UI. Nêu trách nhiệm, dependency, interface; tạo Mermaid diagram.
4. So sánh format: một .gnote.md chứa JSON; .gnote.md kèm asset directory; file dữ liệu riêng theo page. Đề xuất schema version, metadata, pages, dimensions, templates, strokes, shapes, text, images, asset references và preview fallback.
5. Đánh giá cách Obsidian xử lý compound extension .gnote.md và custom view. Xác minh TextFileView/FileView/alternative API; không suy đoán.
6. Thiết kế rendering layers, coordinate transforms page/canvas/viewport/screen, input policy mouse/touch/stylus và giới hạn palm rejection trong web runtime.
7. Đề xuất performance strategy, test strategy, memory management, autosave safety và recovery.
8. Tạo docs/TECHNICAL_DESIGN.md, docs/ARCHITECTURE.md, docs/DATA_FORMAT.md, docs/ROADMAP.md và docs/DECISIONS.md.
9. Kết thúc bằng các quyết định cần tôi duyệt: file format, rendering, storage, input policy, dependencies. Dừng và chờ duyệt. Không làm Phase 1.
```

## PHASE 1 — Project Scaffolding & Obsidian Integration

```text
Thực hiện Phase 1 sau khi Phase 0 được duyệt. Inspect repository và Git status trước khi sửa; không ghi đè thay đổi chưa commit.

1. Thiết lập TypeScript strict, esbuild, Obsidian API types, package scripts, tsconfig, build config, manifest, main entry, styles và README theo tài liệu chính thức hiện hành.
2. Implement plugin lifecycle, unload cleanup, Ribbon icon, Command Palette command, Settings tab và error handling.
3. Implement custom view cho .gnote.md theo kiến trúc đã duyệt. Xác minh compound extension handling, file association, view state và lifecycle. Chọn API view phù hợp dựa trên tài liệu, không đoán.
4. Tạo workspace tối thiểu: sidebar, toolbar, main workspace, status area và trang A4 trống. Hỗ trợ Obsidian theme variables.
5. Chạy typecheck, tests và build. Hướng dẫn cài development build vào Vault và kiểm tra trong Obsidian.
Acceptance: plugin build/load được; mở custom document thấy A4 trống; close/unload không rò listener hoặc tạo view trùng; không có lỗi runtime nghiêm trọng.
Chỉ làm Phase 1, báo cáo và chờ duyệt.
```

## PHASE 2 — Notebook, Page & Paper Rendering

```text
Thực hiện Phase 2. Đọc kiến trúc và code hiện tại trước khi sửa.

1. Tạo typed model cho Notebook, Page, PageSize, Orientation, PaperTemplate và Background. Mỗi page có stable ID. Dùng đơn vị kích thước vật lý đã thống nhất và quy đổi rõ sang render coordinates.
2. Render A4, Letter, custom size, portrait/landscape. Giữ aspect ratio khi zoom; mỗi trang có ranh giới rõ, không phải infinite canvas.
3. Tạo Blank, Ruled, Grid, Dotted, Cornell templates; cấu hình background color, line color, spacing và opacity. Ưu tiên procedural rendering.
4. Tạo continuous vertical scroll: add, insert, delete, duplicate page; page numbering và current page indicator.
5. Tạo thumbnail sidebar, page navigation, current-page highlight và drag/drop reorder. Reorder phải giữ ID và content.
6. Implement coordinate transforms page/canvas/viewport/screen và unit tests cho zoom, scroll, page offsets.
Acceptance: nhiều trang hiển thị và cuộn; zoom không méo; templates đúng; CRUD/reorder không mất content; coordinate tests pass.
Chưa làm handwriting. Báo cáo và chờ duyệt.
```

## PHASE 3 — Digital Inking Engine

```text
Thực hiện Phase 3. Ưu tiên input correctness và handwriting fidelity.

1. Implement Pointer Events: pointerdown/move/up/cancel, capture/release; lấy x/y, pressure, pointerType, tilt, timestamp, pointerId. Dùng getCoalescedEvents khi có và fallback khi không.
2. Phân loại mouse/touch/pen. Pen vẽ; finger scroll/gesture theo policy đã duyệt; two-finger zoom/pan nếu hỗ trợ. Palm rejection chỉ best-effort, không hứa hẹn quá khả năng Web API.
3. Stroke model gồm stable ID, tool, color, width, opacity, raw samples, pressure, timestamp, bounds và optional tilt. Tách raw samples khỏi rendered geometry; không lưu runtime Canvas object.
4. Tích hợp perfect-freehand nếu đã duyệt. Tạo brush behavior cho ballpoint, pressure pen, fountain pen, highlighter và pencil-like nếu khả thi. Không tuyên bố tilt/brush physics chưa triển khai.
5. Tạo background, committed strokes, active stroke, highlighter và interaction layers. Tránh redraw toàn notebook mỗi pointer sample.
6. Toolbar: pen, fountain pen, highlighter, eraser, color presets/custom picker và width selector.
7. Stroke eraser và precision eraser. Precision eraser phải trim/split theo geometry hoặc công bố rõ giới hạn; undo phải khôi phục được.
8. Test stroke model, sample processing, geometry, eraser; benchmark 100/1000/5000 strokes/page nếu môi trường cho phép.
Acceptance: vẽ bằng mouse/stylus tương thích; pressure dùng khi thiết bị cung cấp; tool switching đúng; eraser đúng; nét cũ không bị thay đổi; có hướng dẫn test thiết bị thật.
Chỉ làm Phase 3, báo cáo và chờ duyệt.
```

## PHASE 4 — Selection, Lasso & Shape Recognition

```text
Thực hiện Phase 4 sau khi Phase 3 được duyệt.

1. Chuẩn hóa object interface cho Stroke, Shape, Text, Image với ID, type, bounds, transform, z-order; không làm mất thuộc tính riêng từng loại.
2. Implement hit testing và spatial filtering khi phù hợp.
3. Implement single/multi-select, bounding box, handles, move, resize, rotate, copy/paste, duplicate và delete.
4. Lasso polygon: draw/close path, select enclosed/intersecting theo policy rõ ràng, move/duplicate/delete. Không chỉ dựa bounding box nếu gây chọn sai.
5. Shape recognition: line, circle, ellipse, rectangle, triangle bằng geometry heuristics; có confidence threshold và giữ raw stroke khi không chắc; conversion phải undo được.
6. Command-based Undo/Redo cho create/delete, stroke, transform, shape conversion và page modification.
Acceptance: selection/transform đúng; lasso hạn chế false positive; shape conversion undo được; history khôi phục chính xác; geometry/history tests pass.
Báo cáo và chờ duyệt.
```

## PHASE 5 — Serializer, Storage & Autosave

```text
Thực hiện Phase 5. Đây là phase bảo vệ dữ liệu; ưu tiên integrity hơn tốc độ.

1. Hoàn thiện versioned schema: notebook metadata, page metadata/order/dimensions, templates, strokes, shapes, text, images, asset references và future-compatible fields.
2. Implement serializeDocument, deserializeDocument, validateDocument, migrateDocument. Không serialize DOM/Canvas/runtime state.
3. Implement .gnote.md theo format đã duyệt: YAML frontmatter, version, structured payload, preview fallback nếu có, asset references. Dùng delimiter rõ ràng; không parse bằng regex mong manh.
4. Storage Manager dùng Vault API hoặc cơ chế đã duyệt. Xử lý multi-file/asset update theo hướng recoverable; không giả định filesystem transaction.
5. Autosave: dirty state, debounce, serialized save queue, status, error handling, backup/recovery. Save cũ không được ghi đè content mới.
6. Xử lý malformed JSON, unsupported version, missing asset, interrupted write và migration failure. Không âm thầm overwrite file lỗi.
7. Test round-trip, empty/large/multi-page documents, invalid data, missing assets, migration và simulated save failure.
Acceptance: save/reopen giữ nguyên; autosave không overwrite dữ liệu mới; file lỗi được bảo toàn; migration và asset resolution có test.
Báo cáo và chờ duyệt.
```

## PHASE 6 — Advanced Note-taking & Obsidian Integration

```text
Thực hiện Phase 6 sau khi Phase 5 được duyệt.

1. Editable Text Box: multiline, font family/size/weight, italic, underline, color/background, alignment, resize/move. Text còn editable sau reopen.
2. Đánh giá MathJax/KaTeX. Lưu LaTeX source riêng với rendered output; hỗ trợ inline/display nếu được duyệt.
3. Image engine: import từ Vault, drag/drop/paste nếu API cho phép; move, resize, crop, rotate, delete. Dùng asset references, tránh nhúng binary lớn vào JSON.
4. Wikilinks: [[Note Name]], alias nếu khả thi; click dùng Obsidian API; xử lý missing note và escaping; không tự thay toàn bộ Markdown parser.
5. PDF background: đánh giá PDF.js/giải pháp phù hợp; import, render page làm background, annotation phía trên; giữ nguyên PDF nguồn; map notebook page với source PDF page.
6. Hoàn thiện Vault references, commands, context menu, settings và theme compatibility.
Acceptance: text/image editable sau reopen; Wikilink mở đúng note; PDF gốc không bị sửa; annotation lưu và render lại; không regression.
Báo cáo và chờ duyệt.
```

## PHASE 7 — Export Engine

```text
Thực hiện Phase 7 sau khi Phase 6 được duyệt.

1. Tạo export pipeline từ document model, không chụp screenshot workspace. Output độc lập với zoom, scroll và viewport.
2. PDF: entire notebook, selected/current pages, A4/Letter/custom, orientation, margins, templates, ink, text, shapes, images và PDF background annotations.
3. Ưu tiên vector paths; rasterize khi cần và ghi rõ. Mục tiêu 300 DPI cho raster content khi phù hợp. Đảm bảo physical dimensions, aspect ratio, page order và font embedding/substitution.
4. PNG/SVG export; chọn scale cho PNG. Không tuyên bố SVG vector hoàn toàn nếu có raster content.
5. Test single/multi-page, mixed sizes, transparency, highlighter, formulas, images và PDF backgrounds.
Acceptance: PDF đúng kích thước và thứ tự; không phụ thuộc viewport; không cắt nội dung ngoài ý muốn; báo cáo rõ rasterization/font limitations.
Báo cáo và chờ duyệt.
```

## PHASE 8 — Performance Engineering

```text
Thực hiện Phase 8. Không rewrite architecture khi chưa có profiling evidence.

1. Đo pointer processing, stroke rendering, frame time, memory, page load/switch, scroll, save và export. Ghi rõ môi trường và dataset.
2. Đánh giá dirty-region rendering, layer caching, OffscreenCanvas khi hỗ trợ, viewport culling, spatial indexing, stroke simplification và lazy rendering. Chỉ áp dụng khi benchmark chứng minh lợi ích.
3. Kiểm tra 60/90/120Hz nếu có phần cứng; dùng requestAnimationFrame đúng mục đích; xử lý coalesced samples không làm mất dữ liệu. Không khẳng định 120 FPS chỉ vì màn hình 120Hz.
4. Benchmark 1000/5000 strokes per page, 10000 strokes/document, nhiều pages và large images.
5. Kiểm tra canvas cache, image resources, detached DOM, listeners, history growth và view cleanup.
6. Báo cáo baseline, bottleneck, thay đổi, before/after metrics, điều kiện test và regression. Không bịa số liệu.
Acceptance: input/scroll tốt ở workload mục tiêu; memory kiểm soát; không mất samples; save không block lâu; benchmark tái lập.
Báo cáo và chờ duyệt.
```

## PHASE 9 — QA, Documentation & Release

```text
Thực hiện Phase 9 sau khi các Phase trước được duyệt.

1. Hoàn thiện automated tests cho document model, serializer, migration, coordinate transforms, stroke geometry, selection, undo/redo, page ordering, assets và export.
2. Integration tests: startup/shutdown, open/close, create/edit, autosave/reopen, recovery và export.
3. Compatibility matrix cho Obsidian Desktop/Mobile và OS mục tiêu. Phân biệt tested, expected-but-untested và unsupported. Không tuyên bố stylus/Apple Pencil support nếu chưa test thiết bị.
4. Data integrity audit: unexpected shutdown, malformed file, missing assets, interrupted save, large notebook và migration.
5. UX audit: toolbar, navigation, shortcuts, touch, themes, errors và accessibility cơ bản.
6. Hoàn thiện README, installation guide, user guide, feature list, known limitations, manifest, version và release notes.
7. Tạo docs/RELEASE_READINESS.md: completed features, open bugs, test/performance/compatibility results, limitations, installation và recommendation.
Chỉ kết luận production-ready khi acceptance criteria quan trọng pass và có bằng chứng. Báo cáo và chờ duyệt.
```

---

## Prompt Debugging & Code Review

```text
Bạn là Principal TypeScript Engineer đang debug Obsidian NotePages. Không sửa code ngay.

1. Thu thập error, stack trace, console logs, reproduction steps, expected/actual behavior và source liên quan. Tự tái hiện nếu có thể.
2. Xác định root cause, module ảnh hưởng, lỗi kiến trúc hay implementation, regression risk và tác động dữ liệu.
3. Đề xuất file cần sửa, cách sửa, lý do an toàn và test cần bổ sung. Xin phép nếu đổi schema/public interface.
4. Implement thay đổi nhỏ nhất; không rewrite module không liên quan, không xóa/reset dữ liệu để che lỗi.
5. Chạy test liên quan, typecheck, build và regression checks phù hợp.
6. Báo cáo root cause, file sửa, commands/results, rủi ro còn lại. Không tuyên bố fix thành công nếu chưa verify.
```

## Prompt Phase Acceptance Review

```text
Review Phase vừa hoàn thành. Không triển khai tính năng mới và không tự chuyển Phase.

1. Đối chiếu từng acceptance criterion, ghi PASS/PARTIAL/FAIL và bằng chứng.
2. Kiểm tra source, files changed, typing, module boundaries, lifecycle, error handling và maintainability.
3. Chạy typecheck/lint/tests/build phù hợp; ghi đúng command và output.
4. Kiểm tra integration, data integrity, TODO/placeholders/mock behavior và regression risk.
5. Phân loại issue Critical/High/Medium/Low.
6. Verdict: ACCEPTED, ACCEPTED WITH LIMITATIONS hoặc REJECTED. Nêu việc cần sửa và dừng chờ tôi quyết định.
```

## Prompt Performance Tuning

```text
Act as a Principal Graphics Performance Engineer. Audit current rendering/input pipeline. Do not rewrite before profiling.

Measure pointer throughput, coalesced event handling, geometry generation, redraw frequency, dirty regions, layer caching, viewport culling, coordinate transforms, allocations and autosave interference.
Benchmark representative documents at 60/90/120Hz where hardware is available. Record environment, dataset, baseline, bottleneck, proposed changes, risks and before/after results.
Preserve handwriting fidelity; never silently drop meaningful pointer samples. Do not claim targets without measurements.
```

## Git Safety Rules

```text
Before changes, inspect git status and current branch. Never reset, clean, force-push, delete files or overwrite uncommitted user changes. Do not commit/push unless explicitly requested. Keep each Phase reviewable. Suggest a commit message after acceptance. If unexplained working-tree changes affect files you need to edit, stop and ask.
```

## Phase transition prompt

```text
Tôi xác nhận Phase hiện tại đã được nghiệm thu. Hãy bắt đầu Phase tiếp theo theo PROMPT.md. Trước khi triển khai, kiểm tra repository, kiến trúc và thay đổi hiện tại. Không lặp lại phần đã hoàn thành nếu không có lý do. Chỉ làm đúng phạm vi Phase tiếp theo, chạy kiểm thử và dừng chờ nghiệm thu.
```

## Definition of Done

- [ ] Notebook tạo được trong Obsidian.
- [ ] Có nhiều trang cố định A4/Letter/custom.
- [ ] Có paper templates.
- [ ] Viết tay bằng input device tương thích.
- [ ] Có công cụ chỉnh sửa đối tượng.
- [ ] Có text, image và Obsidian links.
- [ ] Save/reopen an toàn.
- [ ] Export PDF nhiều trang.
- [ ] Quản lý notebook trong Vault.
- [ ] Có compatibility matrix và known limitations.

**Product principle:** Goodnotes-like note-taking experience + editable digital ink + Obsidian-native knowledge integration.

**Final instruction:** Build incrementally. Verify every Phase. Protect user data. Never trade correctness for the appearance of progress.
