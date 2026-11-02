# Architecture Decision Records (ADR) — Obsidian NotePages

Tài liệu này ghi lại các quyết định kiến trúc cốt lõi đã được phân tích, lý do lựa chọn, hậu quả và các phương án thay thế được xem xét.

---

## ADR-001: Lựa chọn định dạng tệp lưu trữ (.gnote.md kèm thư mục tài nguyên ngoài)

### Bối cảnh (Context)
Plugin cần một định dạng tệp lưu trữ dữ liệu notebook nhiều trang gồm vector nét vẽ, văn bản, hình học và ảnh nhúng. Định dạng này phải tương thích sâu với hệ sinh thái Obsidian (Wikilinks, Graph View, Obsidian Sync, Git backup) và không làm suy giảm hiệu năng khi notebook mở rộng.

### Quyết định (Decision)
Chọn định dạng tệp mở rộng kép **`.gnote.md`** kết hợp với thư mục tài nguyên ngoài:
- Tệp `.gnote.md` là một tệp Markdown hợp lệ gồm: YAML Frontmatter (cho Obsidian index/metadata), phần xem trước Markdown Preview Fallback (cho các thiết bị không có plugin đọc được tóm tắt) và khối dữ liệu có cấu trúc ```` ```notepages-data ... ``` ```` chứa JSON vector.
- Hình ảnh nhúng và tệp PDF nguồn được lưu thành các tệp độc lập trong thư mục đính kèm của Vault (Attachment folder), tệp `.gnote.md` chỉ lưu đường dẫn tương đối.

### Hậu quả (Consequences)
- **Ưu điểm**:
  - Tương thích 100% với hệ thống Obsidian Sync và Git: Kích thước tệp nhỏ, diff rõ ràng khi thay đổi nét vẽ.
  - Hỗ trợ đầy đủ liên kết hai chiều Wikilinks (`[[Note Name]]`) và xuất hiện trên Graph View của Obsidian.
  - Người dùng vẫn đọc được tóm tắt nội dung khi mở trên các trình đọc Markdown thông thường.
- **Nhược điểm**:
  - Obsidian không thể tự động map đuôi kép `.gnote.md` qua `registerExtensions`. Phải sử dụng cơ chế lắng nghe sự kiện `file-open` và hoán đổi View State trên Workspace Leaf.

### Các phương án thay thế đã bị loại:
1. *Tệp `.gnote.md` nhúng toàn bộ ảnh Base64*: Bị loại vì làm tệp phình to hàng chục MB, gây nghẽn bộ nhớ và treo Obsidian Sync.
2. *Thư mục gói tài liệu (Multi-file bundle)*: Bị loại vì Obsidian không có cơ chế bundle ảo, người dùng sẽ thấy vault bị xáo trộn bởi hàng loạt tệp JSON nhỏ lẻ.

---

## ADR-002: Lựa chọn kiến trúc hiển thị kết hợp (Hybrid Multi-Layer Rendering Architecture)

### Bối cảnh (Context)
Hệ thống cần hiển thị cùng lúc: mẫu giấy (lưới, dòng kẻ), hàng nghìn nét vẽ tay, hình ảnh, văn bản có thể chỉnh sửa có hỗ trợ IME tiếng Việt, công thức LaTeX và khung chọn đối tượng (Lasso/Bounding Box).

### Quyết định (Decision)
Chọn mô hình kiến trúc hiển thị phân tầng kết hợp **Hybrid Multi-Layer Architecture**:
1. **Paper Template Layer (Canvas 2D / CSS)**: Vẽ lưới, dòng kẻ, bố cục Cornell.
2. **Committed Inking Layer (Canvas 2D)**: Kết xuất toàn bộ các nét vẽ đã hoàn thành thành một bề mặt bitmap tĩnh.
3. **Active Inking Layer (Canvas 2D)**: Kết xuất riêng nét vẽ đang được rê bút trong thời gian thực.
4. **Rich Objects Layer (HTML DOM)**: Chứa các hộp văn bản (Text Box), công thức LaTeX và ảnh định vị tuyệt đối.
5. **Interaction & Selection Layer (SVG Overlay)**: Hiển thị đường bao Lasso, bounding box và các tay cầm điều khiển (Handles).

### Hậu quả (Consequences)
- **Ưu điểm**:
  - Tách biệt hoàn toàn luồng vẽ nét tức thời (`Active Inking`) khỏi hàng nghìn nét cũ (`Committed Inking`), loại bỏ hiện tượng giật khung hình khi vẽ.
  - Tận dụng engine chữ và bộ gõ IME bản địa của trình duyệt cho hộp văn bản mà không phải tự tái tạo con trỏ văn bản phức tạp trên Canvas.
  - Các handles của vùng chọn luôn sắc nét tuyệt đối dưới mọi tỉ lệ zoom nhờ SVG.
- **Nhược điểm**:
  - Đòi hỏi sự đồng bộ chính xác về tọa độ giữa các lớp Canvas, DOM và SVG khi cuộn và thu phóng trang.

### Các phương án thay thế đã bị loại:
1. *SVG thuần*: Bị loại vì khi số lượng nét vẽ vượt quá 1.000, số lượng DOM node quá lớn gây nghẽn layout và giảm FPS khi pan/zoom.
2. *Canvas 2D thuần*: Bị loại vì việc tự cài đặt bộ gõ văn bản đa dòng (hỗ trợ IME tiếng Việt, chọn chữ, bôi đen) trên Canvas là cực kỳ phức tạp và dễ phát sinh lỗi.

---

## ADR-003: Quản lý lưu trữ và cơ chế Autosave an toàn

### Bối cảnh (Context)
Ghi chú viết tay phát sinh dữ liệu liên tục theo từng nét vẽ. Nếu ghi đĩa liên tục sẽ làm nghẽn I/O và làm giảm tuổi thọ ổ cứng. Nếu lưu chậm sẽ có nguy cơ mất nét vẽ khi tắt ứng dụng đột ngột. Đồng thời phải chống tuyệt đối việc ghi đè tệp rỗng khi có lỗi.

### Quyết định (Decision)
- Sử dụng trực tiếp **Obsidian Vault API (`app.vault.modify`)** làm nguồn lưu trữ duy nhất.
- Áp dụng cơ chế **Debounced Mutex Save Queue**:
  - Khi có nét vẽ mới, đánh dấu trạng thái tài liệu là `dirty`.
  - Hẹn giờ tự động lưu sau 1.000ms tính từ nét vẽ cuối cùng.
  - Sử dụng khóa đồng bộ (Mutex Lock) để đảm bảo tại một thời điểm chỉ có duy nhất một tác vụ ghi tệp đang diễn ra.
  - Kiểm tra tính hợp lệ của dữ liệu bằng bộ phân tích Zod Schema trước khi gọi lệnh ghi đĩa.
  - Nếu xảy ra lỗi phân tích hoặc ghi tệp thất bại: Không ghi đè lên đĩa, giữ nguyên dữ liệu trong RAM và tạo một bản sao lưu khẩn cấp dạng `.backup` vào thư mục an toàn.

### Hậu quả (Consequences)
- **Ưu điểm**:
  - An toàn dữ liệu tuyệt đối, không có tình trạng xung đột ghi đồng thời hoặc hỏng tệp do tắt ứng dụng đột ngột.
  - Tương thích tự nhiên với cơ chế sao lưu và quản lý xung đột của Obsidian.
- **Nhược điểm**:
  - Phải quản lý trạng thái chờ (Pending Save) khi người dùng chủ động đóng tab hoặc đóng cửa sổ Obsidian.

---

## ADR-004: Thuật toán tạo hình học nét bút (perfect-freehand)

### Bối cảnh (Context)
Nét viết tay cần đạt được độ mượt mà tự nhiên, phản hồi chính xác theo áp lực của bút cảm ứng (Apple Pencil, S-Pen, Surface Pen) và tạo cảm giác như bút thật trên giấy.

### Quyết định (Decision)
Tích hợp thư viện **`perfect-freehand`** (tác giả Steve Ruiz) để chuyển đổi chuỗi điểm tọa độ và áp lực bút thành đa giác bao quanh nét vẽ (Outline Polygon) trước khi vẽ lên Canvas 2D.

### Hậu quả (Consequences)
- **Ưu điểm**:
  - Thư viện cực kỳ nhỏ gọn (~8KB), không có dependency phụ, thuần toán học.
  - Tối ưu hóa cao độ, hỗ trợ mô phỏng nét bút máy, bút bi, bút dạ quang thông qua các tham số: `size`, `thinning`, `smoothing`, `streamline`, `easing`.
- **Nhược điểm**:
  - Nét vẽ được chuyển thành đa giác (Filled Polygon) thay vì đường cong đơn nét (Stroke Path), đòi hỏi thuật toán Precision Eraser phải xử lý cắt đa giác thay vì cắt đường spline đơn giản.

---

## ADR-005: Chính sách phân loại thiết bị đầu vào và Palm Rejection

### Bối cảnh (Context)
Môi trường Chromium/WebKit trên Desktop và Mobile không cung cấp API phần cứng cấp thấp cho Palm Rejection tuyệt đối. Cần phân định rõ ràng giữa nét vẽ cố ý và sự tiếp xúc vô tình của lòng bàn tay hoặc ngón tay khi cuộn trang.

### Quyết định (Decision)
Thiết lập chính sách đầu vào theo chuẩn Goodnotes:
1. **Bút cảm ứng (`pointerType === 'pen'`)**:
   - Chuyên trách 100% cho việc viết và vẽ.
   - Khi phát hiện sự kiện từ bút, kích hoạt trạng thái `PenActive` và từ chối xử lý toàn bộ các sự kiện từ ngón tay (`touch`) trong suốt thời gian vẽ cộng thêm 300ms sau khi nhấc bút.
   - Tận dụng `pointerEvent.getCoalescedEvents()` để thu thập toàn bộ các điểm mẫu phần cứng ghi nhận giữa các khung hình.
2. **Ngón tay (`pointerType === 'touch'`)**:
   - Mặc định chỉ dùng để điều hướng: 1 ngón tay cuộn trang (Pan), 2 ngón tay thu phóng (Pinch Zoom) và xoay trang.
   - Bỏ qua các sự kiện chạm có kích thước tiếp xúc lớn (`width > 25px` hoặc `height > 25px`) đặc trưng của lòng bàn tay.
3. **Chuột (`pointerType === 'mouse'`)**:
   - Tuân theo công cụ đang chọn trên Toolbar (Vẽ, Tẩy, Chọn vùng).

### Hậu quả (Consequences)
- **Ưu điểm**:
  - Trải nghiệm tự nhiên, người dùng có thể tì tay thoải mái khi viết bằng bút cảm ứng trên iPad và máy tính bảng.
  - Tránh được 99% các nét vẽ rác do lòng bàn tay vô tình quẹt vào màn hình.
- **Nhược điểm**:
  - Người dùng muốn vẽ bằng ngón tay phải vào phần cài đặt để bật chế độ "Draw with finger".

---

## ADR-006: Danh mục thư viện phụ thuộc (Dependencies Rationale)

Hệ thống tuân thủ nguyên tắc tối giản dependency, chỉ thêm các thư viện đã được kiểm chứng, có giấy phép mở an toàn và có kích thước bundle nhỏ:

1. **`perfect-freehand`** (Giấy phép: MIT, Dung lượng: ~8 KB):
   - *Lý do*: Tạo đa giác nét bút mượt mà dựa trên lực nhấn bút.
2. **`zod`** (Giấy phép: MIT, Dung lượng: ~12 KB minified):
   - *Lý do*: Xác thực dữ liệu JSON và bảo vệ an toàn schema tại runtime trước khi ghi đĩa; quản lý migration an toàn tuyệt đối.
3. **`pdf-lib`** (Giấy phép: MIT, Dung lượng: ~150 KB):
   - *Lý do*: Thư viện thuần JavaScript độc lập để tạo, ghép và xuất tệp PDF vector nhiều trang với đúng tỉ lệ kích thước vật lý A4/Letter.
4. **`pdfjs-dist`** (Giấy phép: Apache-2.0):
   - *Lý do*: Engine chuẩn của Mozilla để render trang PDF nền lên Canvas 2D phục vụ tính năng chú thích tài liệu PDF.
