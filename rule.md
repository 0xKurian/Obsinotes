## 1. Nguyên tắc chung

1. Ưu tiên tính đúng đắn, ổn định, dễ bảo trì và trải nghiệm người dùng.
2. Không triển khai tính năng ngoài phạm vi Phase hiện tại nếu chưa được người dùng cho phép.
3. Không tự ý bỏ qua, thay thế hoặc làm đơn giản hóa yêu cầu đã được thống nhất.
4. Không giả định API, hành vi hoặc giới hạn của Obsidian. Kiểm tra tài liệu/API và phiên bản dependency đang dùng trước khi triển khai.
5. Không tạo ra giải pháp tạm bợ chỉ để làm cho build thành công.
6. Khi có nhiều cách triển khai, ưu tiên cách đơn giản, rõ ràng, ít phụ thuộc và phù hợp với kiến trúc hiện tại.
7. Không che giấu lỗi, cảnh báo quan trọng hoặc giới hạn đã biết.
8. Không tuyên bố một tính năng đã hoàn thành nếu chưa kiểm tra thực tế.

## 2. Quy tắc về code

### 2.1. Không comment trong code

- **Không viết comment trong source code.**
- Không sử dụng `//`, `/* ... */`, `/** ... */` hoặc comment tương đương trong các file TypeScript, JavaScript, CSS, SCSS và các file mã nguồn khác.
- Không thêm comment để giải thích một đoạn code, biến, hàm hoặc thuật toán.
- Thay vì comment, hãy viết code rõ ràng, chia hàm hợp lý và đặt tên có ý nghĩa.
- Không xóa các comment bản quyền, license hoặc nội dung bắt buộc do thư viện/định dạng sinh ra. Nếu gặp trường hợp này, giữ nguyên và báo lại.
- Quy tắc này không cấm tài liệu Markdown, README, changelog, JSDoc được yêu cầu riêng hoặc nội dung hướng dẫn dành cho người dùng. Tuy nhiên, không tạo JSDoc trong source code nếu không được yêu cầu.

### 2.2. TypeScript và kiểu dữ liệu

1. Sử dụng TypeScript với chế độ strict.
2. Tránh `any`. Chỉ sử dụng khi thực sự không có lựa chọn an toàn hơn và phải giới hạn phạm vi sử dụng.
3. Ưu tiên `unknown` khi nhận dữ liệu chưa xác định; kiểm tra và thu hẹp kiểu trước khi sử dụng.
4. Khai báo kiểu rõ ràng cho dữ liệu lưu trữ, sự kiện, cấu hình, API nội bộ và các ranh giới giữa module.
5. Không dùng type assertion để che giấu lỗi kiểu dữ liệu.
6. Không sử dụng `@ts-ignore` hoặc `@ts-nocheck` để né lỗi. Nếu bắt buộc phải xử lý một vấn đề tương thích, cần giải thích và xin xác nhận.
7. Ưu tiên `type` hoặc `interface` nhất quán với quy ước đang có trong repository.
8. Kiểm tra dữ liệu đầu vào từ file, JSON, PDF metadata và API bên ngoài trước khi tin tưởng hoặc sử dụng.

### 2.3. Đặt tên và cấu trúc

- Tên biến, hàm, class, type và file phải mô tả đúng mục đích.
- Dùng `camelCase` cho biến và hàm; `PascalCase` cho class, type và component; hằng số dùng quy ước nhất quán của dự án.
- Tránh tên quá ngắn hoặc mơ hồ như `a`, `b`, `tmp`, `data1`, `doStuff`, ngoại trừ biến đếm cục bộ có ngữ cảnh rõ ràng.
- Mỗi hàm nên đảm nhiệm một trách nhiệm chính.
- Tách logic nghiệp vụ, lưu trữ, giao diện và xử lý input thành các module phù hợp.
- Tránh file quá lớn. Khi một file có nhiều trách nhiệm độc lập, hãy cân nhắc tách module.
- Không tạo abstraction, class hoặc layer không cần thiết.
- Không lặp lại logic ở nhiều nơi nếu có thể dùng một hàm/module chung mà không làm kiến trúc phức tạp hơn.

### 2.4. Chất lượng triển khai

1. Không để lại code chết, import không dùng, biến không dùng hoặc hàm không được sử dụng.
2. Không để lại `TODO`, `FIXME`, placeholder, mock hoặc dữ liệu giả trong tính năng được tuyên bố hoàn thành.
3. Không dùng `console.log` để thay thế cơ chế xử lý lỗi hoặc logging có chủ đích. Xóa log debug trước khi hoàn tất.
4. Không dùng magic number hoặc magic string khi chúng đại diện cho cấu hình hay quy tắc nghiệp vụ quan trọng.
5. Tránh side effect không cần thiết và hạn chế mutable shared state.
6. Xử lý lỗi rõ ràng; không nuốt lỗi bằng `catch` rỗng.
7. Không dùng `setTimeout` hoặc cơ chế trì hoãn để che giấu lỗi đồng bộ hóa nếu chưa hiểu nguyên nhân gốc.
8. Không sao chép nguyên một đoạn code lớn chỉ để thay đổi một vài giá trị.
9. Không tối ưu hóa sớm khi chưa có bằng chứng về nút thắt hiệu năng.
10. Không làm giảm khả năng truy cập hoặc khả năng sử dụng chỉ để đạt hiệu ứng giao diện.

## 3. Quy tắc kiến trúc dự án

1. Giữ ranh giới rõ ràng giữa:
   - Notebook và page model.
   - Rendering và interaction.
   - Inking engine và selection engine.
   - Storage, serialization và autosave.
   - Obsidian integration.
   - Import/export.
2. Không để UI trực tiếp xử lý toàn bộ logic lưu trữ hoặc serialization.
3. Không để module lưu trữ phụ thuộc vào component giao diện.
4. Dữ liệu notebook phải có schema rõ ràng và có version.
5. Các thao tác đọc dữ liệu phải có khả năng xử lý file cũ, dữ liệu thiếu hoặc dữ liệu không hợp lệ theo chiến lược tương thích đã thống nhất.
6. Ưu tiên module nhỏ, phụ thuộc một chiều và API nội bộ rõ ràng.
7. Không thêm dependency mới nếu API có sẵn hoặc một giải pháp nhỏ hơn đáp ứng được yêu cầu.
8. Trước khi thêm dependency, kiểm tra mức độ bảo trì, license, kích thước bundle, tương thích và rủi ro bảo mật.
9. Không tự ý thay đổi cấu trúc thư mục lớn hoặc đổi tên hàng loạt file.
10. Mọi thay đổi kiến trúc ảnh hưởng nhiều module phải được trình bày trước khi triển khai.

## 4. Quy tắc giao diện và trải nghiệm người dùng

1. Giao diện phải nhất quán với phong cách và hệ thống thiết kế đã thống nhất của dự án.
2. Ưu tiên trải nghiệm ghi chú tự nhiên, ít độ trễ và không làm gián đoạn thao tác bằng bút.
3. Các thao tác quan trọng phải có trạng thái phản hồi rõ ràng.
4. Không để thao tác người dùng bị mất dữ liệu khi chuyển trang, đóng view hoặc đóng ứng dụng.
5. Không tự ý thêm popup, modal hoặc thông báo gây gián đoạn nếu không cần thiết.
6. Các control phải có tên, trạng thái và hành vi dễ hiểu.
7. Hỗ trợ theme sáng/tối của Obsidian; không hard-code màu khiến giao diện khó đọc.
8. Tôn trọng kích thước cửa sổ, zoom, DPI và vùng hiển thị khác nhau.
9. Không dùng CSS toàn cục gây ảnh hưởng đến các view hoặc plugin khác.
10. Ưu tiên CSS có scope rõ ràng theo root class của plugin.
11. Kiểm tra trạng thái hover, focus, active, disabled, empty và error.
12. Không hiển thị dữ liệu giả hoặc nút chưa có chức năng trong bản phát hành.

## 5. Quy tắc riêng cho hệ thống viết tay

1. Ưu tiên độ chính xác của nét bút, độ mượt và độ trễ thấp.
2. Dùng Pointer Events và xử lý đúng `pointerType`, `pressure` cùng các thuộc tính được thiết bị hỗ trợ.
3. Không giả định mọi thiết bị đều có pressure, tilt hoặc palm rejection.
4. Khi thiết bị không hỗ trợ một thuộc tính, phải có fallback hợp lý.
5. Không làm mất nét khi đổi công cụ, đổi trang, zoom hoặc cuộn.
6. Phân biệt rõ thao tác viết, chạm, kéo trang, chọn đối tượng và xóa.
7. Không tự ý thay đổi thứ tự layer hoặc thứ tự nét khiến kết quả hiển thị sai.
8. Eraser và lasso phải có hành vi nhất quán, có thể dự đoán.
9. Shape recognition không được tự động thay đổi nét nếu người dùng chưa bật hoặc chưa xác nhận chế độ phù hợp.
10. Không lưu trạng thái tạm của pointer như thể đó là nét đã hoàn tất.
11. Dữ liệu nét bút phải giữ đủ thông tin cần thiết để render lại nhất quán.
12. Các thao tác undo/redo phải khôi phục đúng trạng thái trước đó, không làm mất dữ liệu không liên quan.

## 6. Quy tắc lưu trữ và an toàn dữ liệu

<badge-placeholder />

1. **Không bao giờ ghi đè hoặc xóa dữ liệu người dùng khi chưa có cơ chế an toàn.**
2. Không tự ý đổi định dạng file đang tồn tại nếu chưa có kế hoạch migration và xác nhận.
3. Autosave phải có chiến lược chống ghi đè, tránh lưu đồng thời gây hỏng dữ liệu.
4. Ưu tiên ghi file theo cách an toàn: tạo nội dung hoàn chỉnh, ghi tạm khi phù hợp, sau đó thay thế file đích.
5. Không đánh dấu tài liệu đã lưu nếu thao tác ghi thất bại.
6. Khi parse dữ liệu lỗi, giữ nguyên file gốc; không tự động thay bằng dữ liệu rỗng.
7. Migration phải có version, kiểm tra đầu vào và xử lý lỗi.
8. Không xóa dữ liệu cũ trước khi dữ liệu mới được ghi thành công.
9. Không lưu dữ liệu nhạy cảm hoặc thông tin không cần thiết.
10. Không tự ý tạo, xóa hoặc di chuyển file trong vault ngoài phạm vi được người dùng cho phép.
11. Không chạy thao tác destructive trên toàn bộ vault.
12. Nếu phát hiện nguy cơ mất dữ liệu, dừng thao tác và báo cho người dùng trước khi tiếp tục.

## 7. Quy tắc tích hợp Obsidian

1. Sử dụng Obsidian API công khai và phù hợp với phiên bản dependency được khai báo.
2. Không truy cập private/internal API nếu chưa đánh giá rủi ro và được người dùng chấp thuận.
3. Không giả định đường dẫn vault, tên file hoặc cấu trúc thư mục.
4. Tôn trọng workspace, active leaf, Markdown link và cơ chế quản lý file của Obsidian.
5. Không làm hỏng wikilink, frontmatter hoặc nội dung Markdown hiện có.
6. Không can thiệp vào hành vi của plugin khác.
7. Đăng ký và hủy event listener, command, view và resource đúng vòng đời plugin.
8. Dọn dẹp listener, observer, pointer capture và tài nguyên khi view/plugin đóng.
9. Không để event listener hoặc animation loop tồn tại sau khi component đã bị hủy.
10. Kiểm tra khả năng tương thích với desktop/mobile trước khi tuyên bố hỗ trợ.

## 8. Quy tắc hiệu năng

1. Tránh render lại toàn bộ notebook khi chỉ một vùng nhỏ thay đổi.
2. Hạn chế tạo object, array hoặc function mới liên tục trong các luồng pointer có tần suất cao nếu gây áp lực GC.
3. Dùng batching hoặc cơ chế cập nhật phù hợp cho thao tác vẽ.
4. Không thực hiện parse/serialize toàn bộ tài liệu trong mỗi sự kiện pointer.
5. Không chặn main thread bằng tác vụ nặng nếu có thể chia nhỏ hoặc chuyển sang worker phù hợp.
6. Dọn dẹp tài nguyên canvas, SVG, observer và event listener đúng lúc.
7. Kiểm tra notebook có nhiều trang và nhiều nét, không chỉ tài liệu mẫu nhỏ.
8. Đo hiệu năng trước và sau khi tối ưu; không khẳng định nhanh hơn nếu chưa có số liệu.
9. Không đánh đổi độ chính xác nét bút hoặc độ an toàn dữ liệu để lấy hiệu năng nếu chưa được chấp thuận.
10. Tránh memory leak khi mở/đóng notebook hoặc chuyển qua lại nhiều trang.

## 9. Quy tắc kiểm thử

1. Mọi tính năng mới phải có kiểm thử phù hợp với mức độ rủi ro.
2. Sửa bug phải có test tái hiện lỗi nếu có thể.
3. Kiểm tra cả trường hợp bình thường, dữ liệu rỗng, dữ liệu không hợp lệ và tình huống biên.
4. Kiểm tra undo/redo, autosave và khôi phục dữ liệu đối với các thao tác chỉnh sửa.
5. Kiểm tra tương tác chuột và bút; không chỉ kiểm tra bằng click chuột.
6. Kiểm tra zoom, scroll, resize và chuyển trang.
7. Chạy các lệnh typecheck, test và build hiện có trước khi báo hoàn thành.
8. Không bỏ qua test thất bại. Phải tìm nguyên nhân hoặc báo rõ lỗi còn tồn tại.
9. Không sửa test chỉ để làm cho test pass nếu hành vi thực tế vẫn sai.
10. Nếu repository chưa có test cho một khu vực quan trọng, nêu rõ giới hạn và đề xuất bổ sung.

## 10. Quy tắc Git

1. Kiểm tra `git status` trước khi chỉnh sửa.
2. Không xóa, ghi đè hoặc hoàn tác thay đổi chưa commit của người dùng.
3. Không tự ý chạy `git reset --hard`, `git clean -fd`, force push hoặc lệnh có nguy cơ mất dữ liệu.
4. Không tự ý commit, push, merge, rebase hoặc tạo release nếu người dùng chưa yêu cầu.
5. Không sửa lịch sử Git của người dùng.
6. Không đưa secret, token, API key, file cá nhân hoặc dữ liệu vault vào Git.
7. Không thêm file build, cache hoặc dependency artifacts nếu `.gitignore` quy định không theo dõi.
8. Khi hoàn thành, liệt kê các file đã tạo, sửa hoặc xóa.
9. Nếu phát hiện thay đổi không liên quan trong working tree, không tự ý chỉnh sửa chúng.
10. Giữ diff nhỏ, có mục đích và dễ review.

## 11. Quy tắc bảo mật và dependency

1. Không hard-code token, mật khẩu, API key hoặc thông tin xác thực.
2. Không thực thi nội dung lấy từ file notebook hoặc PDF như code.
3. Xem dữ liệu nhập từ file là dữ liệu không đáng tin cậy.
4. Kiểm tra file type, kích thước và dữ liệu trước khi import.
5. Không tải hoặc gửi dữ liệu vault ra ngoài nếu chưa được người dùng cho phép.
6. Không thêm dependency không rõ nguồn gốc hoặc không cần thiết.
7. Kiểm tra license và rủi ro bảo mật của thư viện mới.
8. Không vô hiệu hóa kiểm tra bảo mật hoặc CSP chỉ để né lỗi.
9. Không dùng API hoặc script từ xa không cần thiết.
10. Không ghi nội dung tài liệu người dùng vào log.

## 12. Quy trình làm việc bắt buộc cho mỗi Phase

Trước khi code:

1. Đọc `PROMPT.md`, `RULE.md` và yêu cầu của Phase hiện tại.
2. Kiểm tra cấu trúc repository và các module liên quan.
3. Kiểm tra `git status`.
4. Xác định mục tiêu, phạm vi, dependency và tiêu chí nghiệm thu.
5. Nêu các rủi ro hoặc điểm chưa rõ trước khi triển khai.
6. Không bắt đầu Phase tiếp theo khi chưa được người dùng cho phép.

Trong khi code:

1. Chỉ sửa những file cần thiết.
2. Tuân thủ kiến trúc và quy tắc trong tài liệu.
3. Không tự ý thay đổi API hoặc schema đã thống nhất.
4. Nếu phát hiện cần thay đổi phạm vi, dừng lại và xin xác nhận.
5. Không tạo comment trong source code.

Sau khi code:

1. Chạy typecheck, test và build phù hợp.
2. Kiểm tra diff để phát hiện thay đổi ngoài ý muốn.
3. Kiểm tra không còn debug log, code chết hoặc placeholder.
4. Báo cáo chính xác những gì đã làm và chưa làm.
5. Nêu rõ lệnh đã chạy cùng kết quả thực tế.
6. Liệt kê lỗi còn tồn tại và rủi ro chưa được giải quyết.
7. Chờ người dùng nghiệm thu trước khi chuyển Phase.

## 13. Quy tắc báo cáo kết quả

Mỗi lần hoàn thành một công việc, báo cáo theo cấu trúc:

### Completed
- Những phần đã hoàn thành.

### Files Changed
- Danh sách file được tạo, sửa hoặc xóa.
- Mục đích của từng thay đổi.

### Verification
- Lệnh typecheck đã chạy và kết quả.
- Lệnh test đã chạy và kết quả.
- Lệnh build đã chạy và kết quả.
- Những kiểm thử thủ công đã thực hiện.

### Known Issues
- Lỗi còn tồn tại.
- Giới hạn chưa xử lý.
- Rủi ro hoặc phần chưa được xác minh.

### Next Step
- Đề xuất bước tiếp theo trong Phase hiện tại.
- Không tự động bắt đầu Phase tiếp theo.

Không được ghi `Passed`, `Completed` hoặc `Ready` cho một hạng mục nếu chưa có bằng chứng kiểm tra tương ứng.

## 14. Những hành vi bị cấm

- Viết comment trong source code.
- Tự ý mở rộng phạm vi Phase.
- Tự ý chuyển sang Phase tiếp theo.
- Đoán API hoặc tạo API không tồn tại.
- Dùng `any` tràn lan hoặc vô hiệu hóa TypeScript strict.
- Nuốt lỗi hoặc che giấu cảnh báo.
- Để lại code giả, placeholder hoặc debug log trong tính năng hoàn thành.
- Ghi đè, xóa hoặc migration dữ liệu người dùng một cách không an toàn.
- Chạy lệnh Git destructive khi chưa được phép.
- Thêm dependency chỉ vì tiện lợi.
- Tuyên bố đã test hoặc build thành công khi chưa chạy.
- Thay đổi file không liên quan đến nhiệm vụ.
- Tạo UI có nút hoặc tính năng chưa hoạt động nhưng thể hiện như đã hoàn thiện.

## 15. Thứ tự ưu tiên khi có xung đột

Khi các yêu cầu hoặc quy tắc có vẻ mâu thuẫn, áp dụng thứ tự ưu tiên sau:

1. An toàn dữ liệu và bảo mật.
2. Yêu cầu trực tiếp mới nhất của người dùng.
3. Tiêu chí nghiệm thu của Phase hiện tại trong `PROMPT.md`.
4. Các quy tắc trong `RULE.md`.
5. Quy ước và kiến trúc hiện có của repository.
6. Sở thích triển khai của Antigravity.

Nếu vẫn không thể xác định cách xử lý an toàn, hãy dừng lại, trình bày lựa chọn và hỏi người dùng.

---

## Final Instruction

**Treat this file as mandatory project policy, not optional suggestions.**

Before every implementation task, verify that the planned changes comply with `RULE.md`. If a requested change requires violating a rule, do not silently ignore the rule. Explain the conflict and obtain the user's approval before proceeding.