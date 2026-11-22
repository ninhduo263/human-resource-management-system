/**
 * Xuất báo cáo ra Excel (.xlsx thật, có định dạng) và PDF (in qua trình duyệt — giữ đúng
 * font tiếng Việt, người dùng chọn "Lưu dưới dạng PDF"). Dữ liệu xuất là dữ liệu đã được
 * máy chủ lọc theo quyền, nên file xuất cũng tôn trọng phân quyền.
 */
import type { Contract, ContractExtension, Department, Employee, Position } from '../types';
import { formatDate, formatMoney } from './format';

export type Cell = string | number | null | undefined;

export interface ReportSpec {
  title: string;
  fileName: string; // không gồm phần mở rộng
  headers: string[];
  rows: Cell[][];
  meta?: [string, string][]; // các dòng thông tin: [nhãn, giá trị]
  author?: string;
  /** Chỉ số các cột là số tiền / số để căn phải và định dạng số trong Excel. */
  numericColumns?: number[];
}

const ORG_NAME = 'CÔNG TY PEOPLEOPS — NHÓM 16';
const BRAND = 'FF155E4B';

/** Chặn công thức độc hại (CSV/Excel injection) khi ô bắt đầu bằng = + - @. */
const safeText = (v: Cell) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
};

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportExcel(spec: ReportSpec): Promise<void> {
  // Tải thư viện khi cần (code-splitting) để không làm nặng lần tải trang đầu.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.author || 'PeopleOps HRMS';
  wb.created = new Date();
  const ws = wb.addWorksheet(spec.title.slice(0, 31), {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const colCount = Math.max(spec.headers.length, 1);

  const titleRow = ws.addRow([ORG_NAME]);
  titleRow.font = { bold: true, size: 11, color: { argb: BRAND } };
  ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);

  const headRow = ws.addRow([spec.title.toUpperCase()]);
  headRow.font = { bold: true, size: 16 };
  headRow.alignment = { horizontal: 'center' };
  headRow.height = 26;
  ws.mergeCells(headRow.number, 1, headRow.number, colCount);

  for (const [k, v] of spec.meta || []) {
    const r = ws.addRow([`${k}: ${v}`]);
    r.font = { italic: true, size: 10, color: { argb: 'FF5E7066' } };
    ws.mergeCells(r.number, 1, r.number, colCount);
  }
  ws.addRow([]);

  const header = ws.addRow(['STT', ...spec.headers]);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  header.height = 22;
  const headerRowNo = header.number;

  spec.rows.forEach((row, i) => {
    const r = ws.addRow([i + 1, ...row.map(safeText)]);
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = {
        top: { style: 'hair', color: { argb: 'FFCBD5CE' } },
        bottom: { style: 'hair', color: { argb: 'FFCBD5CE' } },
        left: { style: 'thin', color: { argb: 'FFCBD5CE' } },
        right: { style: 'thin', color: { argb: 'FFCBD5CE' } },
      };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8EF' } };
      if (col === 1 || spec.numericColumns?.includes(col - 2)) c.alignment = { horizontal: col === 1 ? 'center' : 'right' };
      if (typeof c.value === 'number' && col !== 1) c.numFmt = '#,##0';
    });
  });

  const totalRow = ws.addRow([`Tổng cộng: ${spec.rows.length} bản ghi`]);
  totalRow.font = { bold: true };
  ws.mergeCells(totalRow.number, 1, totalRow.number, colCount + 1);

  ws.addRow([]);
  const sign = ws.addRow([`Ngày xuất: ${formatDate(new Date().toISOString().slice(0, 10))} · Người lập: ${spec.author || ''}`]);
  sign.font = { italic: true, size: 10 };
  ws.mergeCells(sign.number, 1, sign.number, colCount + 1);

  // Độ rộng cột theo nội dung, cố định dòng tiêu đề và bật bộ lọc.
  const widths = ['STT', ...spec.headers].map((h, idx) =>
    Math.min(
      48,
      Math.max(
        idx === 0 ? 6 : 10,
        h.length + 2,
        ...spec.rows.map((r) => String(idx === 0 ? r.length : r[idx - 1] ?? '').length + 2)
      )
    )
  );
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: colCount + 1 } };

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${spec.fileName}.xlsx`
  );
}

const esc = (v: Cell) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; color: #111; font-size: 13px; margin: 0; }
  .org { display: flex; justify-content: space-between; font-size: 12px; }
  .org .l, .org .r { text-align: center; }
  .org b { display: block; }
  h1 { text-align: center; font-size: 20px; margin: 22px 0 4px; letter-spacing: .5px; }
  .sub { text-align: center; font-style: italic; margin-bottom: 14px; }
  .meta { margin: 0 0 10px; padding: 0; list-style: none; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #555; padding: 5px 6px; vertical-align: top; }
  th { background: #e8efe6; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; } .c { text-align: center; }
  .total { margin-top: 8px; font-weight: bold; }
  .signs { display: flex; justify-content: space-around; margin-top: 28px; text-align: center; page-break-inside: avoid; }
  .signs div { width: 40%; } .signs i { display: block; font-size: 12px; margin-bottom: 60px; }
  p { line-height: 1.55; margin: 4px 0; text-align: justify; }
  h3 { font-size: 14px; margin: 14px 0 4px; }
`;

/** In một tài liệu HTML qua iframe ẩn (không bị chặn popup); người dùng chọn "Lưu dưới dạng PDF". */
export function printHtml(title: string, bodyHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`
  );
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  setTimeout(run, 250);
}

const orgHeader = () => `
  <div class="org">
    <div class="l"><b>${ORG_NAME}</b>Phòng Hành chính – Nhân sự</div>
    <div class="r"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>Độc lập – Tự do – Hạnh phúc</div>
  </div>`;

export function printReportPdf(spec: ReportSpec): void {
  const today = formatDate(new Date().toISOString().slice(0, 10));
  const html = `
    ${orgHeader()}
    <h1>${esc(spec.title.toUpperCase())}</h1>
    <div class="sub">Ngày lập: ${esc(today)}</div>
    <ul class="meta">${(spec.meta || []).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('')}</ul>
    <table>
      <thead><tr><th class="c">STT</th>${spec.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${spec.rows
        .map(
          (r, i) =>
            `<tr><td class="c">${i + 1}</td>${r
              .map((c, idx) => `<td class="${spec.numericColumns?.includes(idx) ? 'num' : ''}">${esc(c)}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>
    </table>
    <div class="total">Tổng cộng: ${spec.rows.length} bản ghi</div>
    <div class="signs">
      <div><b>NGƯỜI LẬP BIỂU</b><i>(Ký, ghi rõ họ tên)</i>${esc(spec.author || '')}</div>
      <div><b>GIÁM ĐỐC</b><i>(Ký, đóng dấu)</i></div>
    </div>`;
  printHtml(spec.title, html);
}

/** In hợp đồng lao động theo mẫu, điền sẵn dữ liệu từ hồ sơ. */
export function printContractPdf(args: {
  contract: Contract;
  employee?: Employee;
  department?: Department;
  position?: Position;
  extensions: ContractExtension[];
}): void {
  const { contract: c, employee: e, department: d, position: p, extensions } = args;
  const term =
    c.LoaiHD === 'Không xác định thời hạn'
      ? `Không xác định thời hạn, kể từ ngày ${formatDate(c.NgayBatDau)}`
      : `Từ ngày ${formatDate(c.NgayBatDau)} đến ngày ${formatDate(c.NgayKetThucGoc || c.NgayKetThuc)}`;
  const extRows = extensions
    .slice()
    .sort((a, b) => a.LanGiaHan - b.LanGiaHan)
    .map(
      (x) =>
        `<tr><td class="c">${x.LanGiaHan}</td><td>${esc(x.LoaiPhuLuc)}</td><td>${esc(formatDate(x.NgayHieuLuc || x.NgayLap))}</td><td>${esc(
          x.NgayKetThucMoi ? formatDate(x.NgayKetThucMoi) : '—'
        )}</td><td class="num">${esc(x.LuongMoi != null ? formatMoney(x.LuongMoi) : '—')}</td><td>${esc(x.LyDo)}</td></tr>`
    )
    .join('');

  const html = `
    ${orgHeader()}
    <h1>HỢP ĐỒNG LAO ĐỘNG</h1>
    <div class="sub">Số: ${esc(c.SoHD || c.MaHD)}</div>
    <p><i>Căn cứ Bộ luật Lao động số 45/2019/QH14 ngày 20/11/2019 và nhu cầu, năng lực của hai bên,</i></p>
    <p>Hôm nay, chúng tôi gồm:</p>
    <h3>BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG): ${ORG_NAME}</h3>
    <p>Đại diện: Ban Giám đốc &nbsp;·&nbsp; Đơn vị quản lý trực tiếp: ${esc(d?.TenPB || '—')}</p>
    <h3>BÊN B (NGƯỜI LAO ĐỘNG): ${esc(e?.HoTen || c.MaNV)}</h3>
    <p>Mã nhân viên: ${esc(c.MaNV)} &nbsp;·&nbsp; Giới tính: ${esc(e?.GioiTinh || '—')} &nbsp;·&nbsp; Ngày sinh: ${esc(
      formatDate(e?.NgaySinh)
    )}</p>
    <p>Địa chỉ: ${esc(e?.DiaChi || '—')}</p>
    <p>Điện thoại: ${esc(e?.SoDienThoai || '—')} &nbsp;·&nbsp; Email: ${esc(e?.Email || '—')}</p>
    <p>Hai bên thỏa thuận ký kết hợp đồng lao động với các điều khoản sau:</p>
    <h3>Điều 1. Loại hợp đồng và thời hạn</h3>
    <p>- Loại hợp đồng: <b>${esc(c.LoaiHD)}</b>.</p>
    <p>- Thời hạn: ${esc(term)}.</p>
    <h3>Điều 2. Công việc và địa điểm làm việc</h3>
    <p>- Chức danh: <b>${esc(p?.TenCV || '—')}</b>; bộ phận: ${esc(d?.TenPB || '—')}.</p>
    <p>- Thực hiện công việc theo mô tả chức danh và sự phân công của người quản lý trực tiếp.</p>
    <h3>Điều 3. Tiền lương và chế độ</h3>
    <p>- Mức lương: <b>${esc(formatMoney(c.MucLuong))}</b>/tháng, trả vào kỳ lương hằng tháng.</p>
    <p>- Được hưởng nghỉ phép năm, ngày lễ, bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp theo quy định pháp luật.</p>
    <h3>Điều 4. Quyền và nghĩa vụ của các bên</h3>
    <p>- Hai bên thực hiện đầy đủ quyền và nghĩa vụ theo Bộ luật Lao động và nội quy lao động của Bên A.</p>
    ${
      extRows
        ? `<h3>Điều 5. Các phụ lục đã ký</h3>
    <table><thead><tr><th>Lần</th><th>Loại phụ lục</th><th>Hiệu lực</th><th>Hạn mới</th><th>Lương mới</th><th>Lý do</th></tr></thead><tbody>${extRows}</tbody></table>`
        : ''
    }
    ${
      c.NgayChamDut
        ? `<p style="margin-top:10px"><b>Ghi chú:</b> Hợp đồng chấm dứt ngày ${esc(formatDate(c.NgayChamDut))} (${esc(
            c.LoaiChamDut || 'Thỏa thuận'
          )}) — ${esc(c.LyDoChamDut || '')}.</p>`
        : ''
    }
    <p style="margin-top:10px">Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
    <div class="signs">
      <div><b>NGƯỜI LAO ĐỘNG</b><i>(Ký, ghi rõ họ tên)</i>${esc(e?.HoTen || '')}</div>
      <div><b>NGƯỜI SỬ DỤNG LAO ĐỘNG</b><i>(Ký, đóng dấu)</i></div>
    </div>`;
  printHtml(`Hop-dong-${c.SoHD || c.MaHD}`, html);
}
