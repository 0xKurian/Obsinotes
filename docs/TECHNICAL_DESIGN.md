# Technical Design Document — Obsidian NotePages

## 1. Yêu cầu hệ thống (Requirements Engineering)

### 1.1. Functional Requirements (Yêu cầu chức năng)
- **Cấu trúc tài liệu (Document Structure)**:
  - Tài liệu gồm nhiều trang cố định (fixed-size pages), cuộn dọc liên tục (continuous vertical scroll).
  - Hỗ trợ các kích thước chuẩn: A4 (210 x 297 mm), US Letter (8.5 x 11 inch) và kích thước tùy chỉnh (Custom dimensions).
  - Hỗ trợ hướng trang: Portrait (dọc) và Landscape (ngang).
  - Quản lý trang: Thêm trang mới, chèn trang vào vị trí bất kỳ, xóa trang, nhân bản trang (duplicate), đổi thứ tự trang bằng thao tác kéo thả (drag-and-drop reorder).
  - Giữ nguyên định danh trang (Page ID) và toàn bộ nội dung khi hoán đổi thứ tự.
- **Hệ thống mẫu giấy (Paper Templates)**:
  - Mẫu nền thủ tục (Procedural templates): Blank (trắng), Ruled (kẻ ngang), Grid (lưới ô vuông), Dotted (chấm bi), Cornell Note.
  - Tùy biến thông số mẫu: Khoảng cách dòng (line spacing), màu sắc (line color), độ mờ (opacity), màu nền trang (paper background color).
- **Hệ thống mực số (Digital Inking Engine)**:
  - Hỗ trợ bút trỏ (Stylus/Apple Pencil/S-Pen/Surface Pen), ngón tay (Touch) và chuột (Mouse).
  - Các công cụ viết vẽ:
    - Ballpoint Pen: Nét đều, đường viền sắc nét, bo tròn ở hai đầu.
    - Pressure Pen: Nét biến thiên độ dày theo lực nhấn của thiết bị.
    - Fountain Pen: Nét vát dẹp có góc nghiêng cố định (calligraphy/chisel style).
    - Highlighter: Nét bán trong suốt, pha trộn màu bên dưới mà không làm che mất văn bản hoặc nét bút.
  - Bảng chọn màu sắc: Danh sách preset màu thông dụng và bộ chọn màu tự do (color picker).
  - Tùy chỉnh kích thước nét bút (Stroke width selector).
- **Công cụ tẩy (Eraser)**:
  - Stroke Eraser: Chạm vào bất kỳ điểm nào của một nét vẽ sẽ xóa toàn bộ nét đó.
  - Precision Eraser: Cắt hoặc tách rời nét vẽ tại vị trí tiếp xúc hình học của đầu tẩy.
- **Lựa chọn và biến đổi đối tượng (Selection & Transform Engine)**:
  - Chọn đơn lẻ (Single select) và chọn nhiều (Multi-select) bằng Bounding Box hoặc Lasso Tool (vùng chọn đa giác tự do).
  - Thao tác đối tượng: Di chuyển (Move), co giãn (Resize giữ hoặc không giữ tỉ lệ), xoay (Rotate), sao chép/dán (Copy/Paste), nhân bản (Duplicate), xóa (Delete).
- **Nhận diện hình học (Shape Recognition)**:
  - Tự động nhận diện nét vẽ tay thành các hình học cơ bản: Đoạn thẳng (Straight Line), Đường tròn (Circle), Hình elip (Ellipse), Hình chữ nhật (Rectangle), Tam giác (Triangle).
  - Kích hoạt dựa trên heuristic hình học và khoảng dừng giữ bút (hold-to-snap).
  - Cho phép hoàn tác (Undo) ngay lập tức để quay lại nét vẽ tay gốc.
- **Văn bản và liên kết Obsidian (Rich Text & Wikilinks)**:
  - Khung văn bản chỉnh sửa tự do (Floating editable text box): Đổi font chữ, cỡ chữ, định dạng in đậm, in nghiêng, gạch chân, căn lề.
  - Wikilinks Obsidian: Hỗ trợ cú pháp `[[Tên Note]]` và `[[Tên Note|Bí danh]]`. Nhấp chuột để mở ghi chú tương ứng trong Obsidian workspace.
  - Hiển thị công thức toán học LaTeX (MathJax/KaTeX) dạng inline và display.
- **Chèn hình ảnh và tài liệu nền PDF**:
  - Chèn ảnh từ Obsidian Vault, clipboard hoặc kéo thả từ bên ngoài. Di chuyển, co giãn, xoay ảnh.
  - Nhập file PDF làm nền trang: Mỗi trang PDF trở thành hình nền cho một trang trong notebook; cho phép viết, vẽ, highlight đè lên trên trang PDF.
- **Lịch sử thao tác (History & Undo/Redo)**:
  - Undo/Redo đa cấp theo mô hình Command Pattern cho mọi thao tác (viết, xóa, biến đổi, chèn ảnh, thêm/xóa/đổi thứ tự trang).
- **Xuất bản (Export Engine)**:
  - Xuất ra tệp PDF nhiều trang chuẩn kích thước vật lý, chất lượng in ấn (300 DPI cho thành phần raster).
  - Xuất từng trang hoặc toàn bộ notebook ra PNG và SVG vector.

### 1.2. Non-Functional Requirements (Yêu cầu phi chức năng)
- **Local-First & Quyền riêng tư (Data Privacy)**: Toàn bộ dữ liệu nằm cục bộ trong Obsidian Vault. Không gửi dữ liệu qua máy chủ trung gian.
- **Tính khả chuyển (Portability)**: Dữ liệu ghi chép được lưu trữ dưới định dạng mở, có thể đọc và trích xuất mà không bị phụ thuộc hoàn toàn vào plugin.
- **Tính nhất quán giao diện (Obsidian Theming)**: Thích ứng tự động với theme sáng/tối (Dark/Light Mode) của Obsidian thông qua biến CSS của hệ thống.
- **Độ tin cậy (Reliability)**: Chống mất dữ liệu ngay cả khi Obsidian bị đóng đột ngột hoặc mất điện giữa chừng.

### 1.3. Performance Requirements (Yêu cầu hiệu năng)
- **Độ trễ nét bút (Inking Latency)**: Thời gian từ khi đầu bút chạm bề mặt đến khi điểm ảnh đầu tiên hiển thị trên màn hình dưới 16ms (tương đương 60 FPS) và tiệm cận 8ms trên màn hình 120Hz (ProMotion/iPad hoặc màn hình tần số quét cao).
- **Khả năng chịu tải (Capacity & Scalability)**:
  - Xử lý mượt mà tối thiểu 2.000 nét vẽ trên mỗi trang mà không giảm tốc độ nhận sự kiện pointer.
  - Xử lý notebook có dung lượng từ 50 đến 100 trang thông qua cơ chế giải phóng bộ nhớ (Virtualization / Viewport Culling).
- **Bộ nhớ tiêu thụ (Memory Footprint)**: Không vượt quá 200MB RAM cho một tài liệu 50 trang đang mở. Thu hồi tài nguyên canvas và bộ nhớ đệm ngay khi trang cuộn ra khỏi vùng nhìn.
- **Tốc độ lưu (Autosave Impact)**: Quá trình serialize và ghi tệp nền không làm giật khung hình (frame drop) của luồng vẽ trên main thread.

### 1.4. Compatibility Requirements (Yêu cầu tương thích)
- **Hệ điều hành**: macOS, Windows, Linux, iPadOS, iOS, Android.
- **Obsidian API**: Tương thích từ Obsidian v1.5.0 trở lên.
- **Thiết bị đầu vào (Input Devices)**:
  - Apple Pencil (iPadOS qua Obsidian Mobile).
  - Samsung S-Pen / Wacom Stylus (Android & Windows tablets).
  - Microsoft Surface Pen.
  - Bàn di chuột cảm ứng (Trackpad), chuột máy tính và ngón tay cảm ứng.

### 1.5. Data-Integrity Requirements (Yêu cầu toàn vẹn dữ liệu)
- Không bao giờ ghi đè tệp bằng nội dung rỗng hoặc nội dung lỗi khi quá trình parse thất bại.
- Sử dụng mô hình ghi tệp an toàn (Safe Write): Ghi ra tệp đệm hoặc hoán đổi trạng thái có kiểm tra mã băm, sau đó mới cập nhật tệp chính.
- Cơ chế Schema Versioning: Mọi tệp dữ liệu đều lưu số hiệu phiên bản cấu trúc (schemaVersion) để tự động nâng cấp dữ liệu mà không làm hỏng tệp cũ.

### 1.6. Phân tích yêu cầu thiếu và giải quyết mâu thuẫn (Gaps & Conflicts Resolution)
1. **Mâu thuẫn giữa Precision Eraser và Hiệu năng**:
   - *Phân tích*: Tẩy chính xác đòi hỏi thuật toán phân tách đường cong Bezier/Polygon tại điểm giao cắt. Nếu nét vẽ gồm hàng nghìn điểm, phép tính hình học liên tục trên mỗi sự kiện pointermove sẽ gây nghẽn CPU.
   - *Giải pháp*: Kết hợp Spatial Index (R-Tree hoặc Bounding Box grid) để thu hẹp phạm vi kiểm tra vào các nét nằm trong bán kính đầu tẩy. Áp dụng thuật toán đơn giản hóa đường gấp khúc (Ramer-Douglas-Peucker) trước khi cắt vector.
2. **Giới hạn Palm Rejection trên môi trường Web/Electron/Capacitor**:
   - *Phân tích*: Môi trường web không cung cấp API phần cứng cấp thấp để loại bỏ lòng bàn tay tuyệt đối. Sự kiện chạm của lòng bàn tay thường phát ra trước hoặc song song với đầu bút.
   - *Giải pháp*: Áp dụng Input Policy nghiêm ngặt: Khi `pointerType === 'pen'` đang hoạt động, hệ thống lập tức hủy và từ chối toàn bộ sự kiện `pointerType === 'touch'` trong thời gian bút tiếp xúc cộng thêm một khoảng trễ an toàn (cooldown window 300ms). Kiểm tra thuộc tính `pointerEvent.width` và `pointerEvent.height`: nếu vùng tiếp xúc lớn bất thường (đặc trưng của lòng bàn tay), tự động bỏ qua.
3. **Mâu thuẫn giữa Compound Extension (.gnote.md) và Native File Routing**:
   - *Phân tích*: Obsidian API `registerExtensions` chỉ nhận phần đuôi sau dấu chấm cuối cùng (tức là `md`). Việc đăng ký `registerExtensions(['gnote.md'])` không hoạt động.
   - *Giải pháp*: Chi tiết tại Mục 5 của tài liệu này (sử dụng cơ chế Leaf View Switching kết hợp nhận diện Frontmatter).
4. **Mâu thuẫn giữa Kích thước tệp Markdown và Dữ liệu đa phương tiện (Images/PDF)**:
   - *Phân tích*: Nếu nhúng toàn bộ ảnh hoặc trang PDF dưới dạng chuỗi base64 vào một tệp `.md`, dung lượng tệp sẽ phình to lên hàng chục megabyte, gây nghẽn Obsidian Sync, Git và làm tê liệt bộ nhớ cache của Obsidian.
   - *Giải pháp*: Tách biệt nội dung: Tệp `.gnote.md` chỉ lưu metadata, vector nét vẽ và đường dẫn tham chiếu đến tài nguyên (Assets) nằm trong thư mục đính kèm của Vault.

---

## 2. So sánh công nghệ và lựa chọn kiến trúc nền tảng

| Tiêu chí | Canvas 2D thuần | SVG thuần | Mô hình kết hợp (Hybrid Canvas + SVG + DOM) |
|---|---|---|---|
| **Hiệu năng nét vẽ (>2000 nét)** | Rất cao (Vẽ trực tiếp trên bitmap buffer, không tạo DOM node) | Kém (Hàng nghìn phần tử DOM làm chậm DOM layout và garbage collection) | **Tối ưu nhất** (Canvas đảm nhiệm nét vẽ; DOM/SVG chỉ dùng cho đối tượng tĩnh và tương tác) |
| **Độ sắc nét khi Zoom** | Cần cập nhật tỉ lệ buffer (DPI scaling) khi dừng zoom | Hoàn hảo (Vector tự nhiên) | Hoàn hảo cho giao diện/text, sắc nét cho nét vẽ nhờ Dynamic Scaling Buffer |
| **Chỉnh sửa văn bản (Text Box)** | Rất phức tạp (Tự cài đặt con trỏ, bẻ dòng, IME tiếng Việt) | Khá phức tạp (Thẻ `<text>` không hỗ trợ rich multiline tốt) | **Xuất sắc** (Sử dụng trực tiếp `contenteditable` hoặc thẻ DOM chuẩn của trình duyệt) |
| **Hộp chọn và Handles (Selection)** | Phải tự vẽ và tự tính toán hit-test điểm góc | Dễ dàng qua SVG overlay | **Xuất sắc** (SVG overlay hiển thị bounding box, rotation handle mượt mà) |
| **Kết luận lựa chọn** | Loại vì bất tiện cho text và selection | Loại vì nghẽn hiệu năng khi vẽ nhiều nét | **ĐƯỢC CHỌN LÀM KIẾN TRÚC CHÍNH** |

### Đánh giá các thư viện và API chuyên biệt:
- **perfect-freehand (Steve Ruiz)**:
  - *Đặc điểm*: Thuật toán tạo đường bao (polygon outline) từ mảng tọa độ điểm kèm áp lực bút. Nhẹ, thuần toán học, không phụ thuộc DOM, độ ổn định cao.
  - *Đánh giá*: **Được chọn** để tính toán hình học nét bút (Ballpoint, Pressure Pen, Highlighter).
- **Pointer Events API & getCoalescedEvents()**:
  - *Đặc điểm*: Chuẩn W3C hiện đại. Hàm `event.getCoalescedEvents()` thu thập đầy đủ các điểm tọa độ trung gian mà phần cứng ghi nhận giữa các khung hình hiển thị (giúp nét vẽ tròn trịa, không bị gãy góc trên màn hình 120Hz).
  - *Đánh giá*: **Bắt buộc sử dụng**, có fallback cho trường hợp trình duyệt không hỗ trợ phương thức này.
- **Obsidian Vault Storage API so với IndexedDB**:
  - *Vault API (`TFile`, `vault.read`, `vault.modify`)*: Lưu trực tiếp vào hệ thống tệp cục bộ, đồng bộ tự động qua Obsidian Sync, sao lưu bằng Git, người dùng sở hữu dữ liệu thật.
  - *IndexedDB*: Truy xuất nhanh dạng nhị phân nhưng dữ liệu nằm trong sandbox của trình duyệt, người dùng không thể sao lưu trực tiếp, có nguy cơ bị hệ điều hành xóa khi thiếu dung lượng.
  - *Đánh giá*: **Vault API là nguồn lưu trữ duy nhất cho nội dung ghi chép**. IndexedDB chỉ được dùng làm bộ đệm hình thu nhỏ (thumbnail cache) có thể tái tạo lại bất cứ lúc nào.
- **Thư viện PDF (PDF.js và pdf-lib)**:
  - *PDF.js (Mozilla)*: Tiêu chuẩn công nghiệp để render các trang PDF lên HTML5 Canvas làm hình nền trang ghi chú.
  - *pdf-lib*: Thư viện JavaScript thuần chuyên dùng để tạo mới, ghép trang, nhúng vector và tạo tệp PDF xuất bản nhiều trang mà không cần môi trường Node.js native.

---

## 3. Kiến trúc các lớp hiển thị (Layering Architecture)

Mỗi trang trong notebook được cấu thành từ một cấu trúc xếp lớp (Stacking Layers) theo thứ tự trục Z từ dưới lên trên:

```
+-------------------------------------------------------+
|  Layer 5: Interaction & Selection Layer (SVG + DOM)   |  <- Handles, Lasso, Bounding Box
+-------------------------------------------------------+
|  Layer 4: Rich Objects Layer (HTML DOM)               |  <- Text Boxes, Obsidian Wikilinks
+-------------------------------------------------------+
|  Layer 3: Active Inking Layer (Canvas 2D - Transient) |  <- Nét vẽ đang được kéo rê
+-------------------------------------------------------+
|  Layer 2: Committed Inking Layer (Canvas 2D - Static) |  <- Toàn bộ nét bút và highlighter đã lưu
+-------------------------------------------------------+
|  Layer 1: PDF Background Layer (Canvas 2D)            |  <- Trang PDF nguồn được render
+-------------------------------------------------------+
|  Layer 0: Paper Template Layer (Canvas 2D / CSS)      |  <- Lưới ô vuông, dòng kẻ, màu giấy
+-------------------------------------------------------+
```

### Nguyên lý vận hành của các lớp:
1. **Paper Template Layer**: Vẽ nền giấy (trắng, vàng ngà, xám đậm), kẻ các đường ngang (Ruled), lưới (Grid), chấm (Dotted) hoặc bố cục Cornell bằng toán học tọa độ. Khi zoom, lớp này được vẽ lại theo đúng khoảng cách chuẩn.
2. **PDF Background Layer**: Nếu trang được tạo từ tệp PDF, trang tương ứng sẽ được PDF.js vẽ lên canvas này một lần duy nhất và lưu vào bộ đệm bộ nhớ.
3. **Committed Inking Layer**: Chứa toàn bộ các nét bút đã vẽ xong trong quá khứ. Lớp này chỉ vẽ lại khi có đối tượng bị xóa, di chuyển, đổi màu hoặc thay đổi tỉ lệ zoom.
4. **Active Inking Layer**: Khi người dùng đặt bút xuống và di chuyển, nét vẽ mới chỉ được kết xuất trực tiếp lên canvas này theo từng frame. Canvas này hoàn toàn độc lập với Committed Layer, giúp thao tác vẽ mượt mà mà không phải vẽ lại hàng nghìn nét cũ. Khi người dùng nhấc bút (`pointerup`), nét vẽ được chuyển từ Active Layer sang Committed Layer và Active Canvas được xóa sạch.
5. **Rich Objects Layer**: Chứa các thẻ HTML định vị tuyệt đối cho hộp văn bản (Text Box), công thức toán học và ảnh nhúng. Tận dụng bộ gõ IME và engine render chữ bản địa của trình duyệt.
6. **Interaction & Selection Layer**: Sử dụng phần tử SVG bao phủ toàn trang để hiển thị đường bao Lasso, khung chữ nhật bao quanh đối tượng được chọn, các điểm neo (Resize Handles) và điểm xoay (Rotate Handle).

---

## 4. Hệ tọa độ và công thức chuyển đổi (Coordinate Transformations)

Hệ thống quản lý 4 không gian tọa độ độc lập:

```
Screen (Pixels) 
      |  (Trừ vị trí bounding rect của Viewport)
      v
Viewport (Pixels)
      |  (Chia cho hệ số Zoom, cộng trừ Pan Offset)
      v
Workspace World (Virtual Points)
      |  (Trừ đi tọa độ Top-Left của từng Page trong Workspace)
      v
Page Local Coordinates (Points: 1 pt = 1/72 inch)
```

### 4.1. Định nghĩa các đại lượng:
- $P_{screen} = (x_{screen}, y_{screen})$: Tọa độ pixel thực tế trên màn hình do thiết bị phần cứng báo về qua sự kiện Pointer Event.
- $R_{viewport}$: Hình chữ nhật bao quanh vùng hiển thị của plugin trên cửa sổ Obsidian (`leaf.view.containerEl.getBoundingClientRect()`).
- $P_{viewport} = P_{screen} - (R_{viewport}.left, R_{viewport}.top)$.
- $Z$: Hệ số phóng to thu nhỏ hiện tại ($Z > 0$, mặc định $1.0$).
- $O = (O_x, O_y)$: Điểm dịch chuyển cuộn trang trong workspace (Pan Offset hoặc `scrollTop`, `scrollLeft`).
- $PageBox_i = (X_i, Y_i, W_i, H_i)$: Vị trí và kích thước của trang thứ $i$ trong không gian Workspace World tính theo đơn vị điểm chuẩn (Points).

### 4.2. Công thức chuyển đổi xuôi (Screen to Page):
Để chuyển một điểm chạm từ màn hình vào tọa độ cục bộ của trang thứ $i$:
$$P_{world}.x = \frac{P_{viewport}.x}{Z} + O_x$$
$$P_{world}.y = \frac{P_{viewport}.y}{Z} + O_y$$
$$P_{page}.x = P_{world}.x - X_i$$
$$P_{page}.y = P_{world}.y - Y_i$$

### 4.3. Công thức chuyển đổi ngược (Page to Viewport/Screen):
Để tính toán vị trí hiển thị một nét vẽ trên màn hình:
$$P_{world}.x = X_i + P_{page}.x$$
$$P_{world}.y = Y_i + P_{page}.y$$
$$P_{viewport}.x = (P_{world}.x - O_x) \times Z$$
$$P_{viewport}.y = (P_{world}.y - O_y) \times Z$$

*Lưu ý cốt lõi*: Toàn bộ dữ liệu nét vẽ, tọa độ văn bản, kích thước hình ảnh đều được lưu trữ trong tệp dưới hệ tọa độ **Page Local Coordinates (Points)**. Dữ liệu này độc lập hoàn toàn với độ phân giải màn hình, hệ số zoom hay vị trí cửa sổ của người dùng.

---

## 5. Đánh giá tích hợp Obsidian và xử lý phần mở rộng kép (.gnote.md)

### 5.1. Bản chất cơ chế định tuyến tệp của Obsidian
- Obsidian phân tích phần mở rộng tệp bằng hàm trích xuất chuỗi: `path.split('.').pop()`. Do đó, đối với một tệp tên là `meeting.gnote.md`, thuộc tính `file.extension` của đối tượng `TFile` luôn luôn trả về chuỗi `"md"`.
- Phương thức `Plugin.registerExtensions(['gnote.md'], viewType)` trong Obsidian API không có tác dụng đối với tên tệp có nhiều dấu chấm nếu đuôi cuối cùng là `md`. Obsidian mặc định gán toàn bộ tệp `.md` cho `markdown-view`.

### 5.2. Giải pháp kỹ thuật được xác minh
Hệ thống kết hợp 3 cơ chế chính thức của Obsidian API:
1. **Khai báo `TextFileView` tùy chỉnh**:
   - Tạo lớp `NotePagesView` kế thừa từ `TextFileView`.
   - Đăng ký view với Obsidian bằng `this.registerView(NOTE_PAGES_VIEW_TYPE, (leaf) => new NotePagesView(leaf))`.
2. **Cơ chế điều phối View State (Leaf Interception)**:
   - Đăng ký lắng nghe sự kiện mở tệp của workspace: `this.registerEvent(this.app.workspace.on('file-open', this.handleFileOpen))`.
   - Khi một tệp được mở trên một `WorkspaceLeaf`, kiểm tra điều kiện:
     - Tên tệp kết thúc bằng đuôi quy ước `.gnote.md`.
     - HOẶC tệp có Frontmatter chứa cờ định danh `notepages-plugin: true`.
   - Nếu thỏa mãn điều kiện và view hiện tại chưa phải là `NOTE_PAGES_VIEW_TYPE`, thực hiện chuyển đổi trạng thái view:
     ```typescript
     leaf.setViewState({
       type: NOTE_PAGES_VIEW_TYPE,
       state: { file: file.path }
     });
     ```
3. **Nút chuyển đổi linh hoạt (View Mode Switcher Action)**:
   - Thêm nút trên thanh tiêu đề của Leaf (Page Header Action) cho phép người dùng chuyển đổi qua lại giữa chế độ hiển thị "NotePages Canvas" và "Raw Markdown Source".
   - Tương thích hoàn toàn với tính năng xem trước tệp và tìm kiếm toàn cục của Obsidian.

---

## 6. Chính sách xử lý đầu vào (Input Policy & State Machine)

Hệ thống thiết lập máy trạng thái nghiêm ngặt để phân loại nguồn sự kiện từ phần cứng:

```
                       +-------------------+
                       |    IDLE STATE     |
                       +-------------------+
                       /         |         \
         pointerType /           |           \ pointerType
              'pen' /            | 'touch'    \ 'mouse'
                   v             v             v
       [ INKING MODE ]    [ GESTURE MODE ]   [ TOOL MODE ]
       - Draw stroke      - 1 finger: Pan    - Active tool:
       - Read pressure    - 2 fingers: Pinch   * Pen: Draw
       - Suppress touch     zoom & pan         * Eraser: Erase
                                               * Lasso: Select
```

### Quy tắc điều phối:
1. **Thiết bị Bút (Pen/Stylus)**:
   - Luôn luôn ở chế độ vẽ nét (Inking), bất kể công cụ phụ trợ nào đang mở.
   - Thu thập đầy đủ áp lực (`pointerEvent.pressure`), góc nghiêng (`tiltX`, `tiltY`) và chuỗi điểm gom tụ (`event.getCoalescedEvents()`).
   - Kích hoạt cơ chế chống tì tay tạm thời (Temporary Palm Suppression): Tự động chặn toàn bộ tương tác ngón tay chạm trên màn hình trong lúc bút đang tiếp xúc.
2. **Ngón tay (Touch)**:
   - Thao tác 1 ngón tay: Cuộn tài liệu (Vertical/Horizontal Pan).
   - Thao tác 2 ngón tay: Thu phóng trang (Pinch to Zoom) và xoay/dịch chuyển trang.
   - Không cho phép vẽ nét bằng ngón tay trừ khi người dùng chủ động bật tùy chọn "Draw with finger" trong bảng cài đặt.
3. **Chuột máy tính (Mouse)**:
   - Tuân theo công cụ đang được chọn trên thanh Toolbar (Bút, Tẩy, Lasso, Chọn vùng hoặc Hộp chữ).
   - Cuộn con lăn chuột (Wheel): Cuộn dọc trang; Giữ phím `Ctrl`/`Cmd` + cuộn chuột: Thu phóng trang mượt mà (Zoom).

---

## 7. Chiến lược hiệu năng và quản lý bộ nhớ (Performance & Memory)

1. **Bộ đệm hiển thị theo vùng nhìn (Viewport Culling & Page Virtualization)**:
   - Một notebook 100 trang chỉ giữ trong bộ nhớ DOM và Canvas các trang nằm trong vùng nhìn hiện tại cộng thêm 1 trang đệm phía trên và 1 trang đệm phía dưới.
   - Các trang nằm ngoài phạm vi này sẽ được hủy bỏ phần tử Canvas 2D để giải phóng bộ nhớ đồ họa (VRAM), chỉ giữ lại đối tượng dữ liệu JSON thuần trong RAM. Khi cuộn tới, trang sẽ được vẽ lại tức thì từ dữ liệu vector.
2. **Kỹ thuật gom cụm sự kiện (Coalesced Event Processing)**:
   - Màn hình 120Hz có thể phát ra hàng trăm sự kiện `pointermove` mỗi giây. Hệ thống gom các điểm tọa độ nhận được qua `getCoalescedEvents()` vào một hàng đợi nhỏ và chỉ kích hoạt một lệnh vẽ hình học duy nhất bằng `requestAnimationFrame`.
3. **Chống áp lực dọn rác (GC Pressure Mitigation)**:
   - Không khởi tạo các mảng hoặc đối tượng tạm thời trong vòng lặp sự kiện `pointermove`. Tái sử dụng các cấu trúc vector và buffer tính toán đã cấp phát sẵn.

---

## 8. Cơ chế an toàn dữ liệu và phục hồi sự cố (Autosave & Disaster Recovery)

```
[ User Input ] ---> [ Dirty State Marked ]
                           |
                           v  (Debounce 1000ms / Pause in drawing)
                  [ Save Queue (Mutex) ]
                           |
                           v
              [ Serialize to JSON Payload ]
                           |
                           v
             [ Validate Schema (Zod Parser) ]
               /                         \
       (Valid)                           (Invalid)
          v                                   v
[ Atomic Write via Vault API ]       [ Log Error & Keep Memory Safe ]
- Write to file.gnote.md             - DO NOT overwrite disk
- Update frontmatter hash            - Emit notification to user
- Release save lock                  - Create Emergency Backup File
```

### Các chốt an toàn bắt buộc:
1. **Hàng đợi lưu tuần tự (Serialized Save Queue with Mutex)**:
   - Ngăn chặn hoàn toàn tình trạng hai tác vụ lưu ghi đè đồng thời lên cùng một tệp. Các yêu cầu lưu tự động (autosave) được gộp lại (coalesced) theo thời gian debounce (1000ms sau nét vẽ cuối cùng).
2. **Kiểm định dữ liệu trước khi ghi (Pre-write Validation)**:
   - Chuỗi nội dung mới bắt buộc phải vượt qua bộ kiểm tra cấu trúc schema (Schema Validator) trước khi gọi hàm `vault.modify()`. Nếu dữ liệu bị hỏng hoặc thiếu trang, hệ thống lập tức hủy thao tác ghi tệp, giữ nguyên tệp gốc trên đĩa và tạo một bản sao lưu khẩn cấp dạng `.backup` trong thư mục cấu hình plugin.
3. **Bảo tồn tệp khi phân tích lỗi (Non-destructive Deserialization)**:
   - Khi mở một tệp bị lỗi định dạng JSON hoặc phiên bản không tương thích, plugin tuyệt đối không tự động tạo mới một tài liệu rỗng để lưu đè lên. Hệ thống sẽ hiển thị thông báo lỗi chi tiết, đề xuất mở tệp dưới dạng văn bản thô để người dùng cứu vãn dữ liệu.
