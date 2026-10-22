'use strict';

const path = require('node:path');
const fs = require('node:fs');
const PDFDocument = require('pdfkit');
const fontkit = require('fontkit');

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const FONTS = {
  en: 'NotoSans.ttf', kn: 'NotoSansKannada.ttf', hi: 'NotoSansDevanagari.ttf',
  te: 'NotoSansTelugu.ttf', ta: 'NotoSansTamil.ttf', ml: 'NotoSansMalayalam.ttf',
  mr: 'NotoSansDevanagari.ttf', bn: 'NotoSansBengali.ttf', gu: 'NotoSansGujarati.ttf',
  pa: 'NotoSansGurmukhi.ttf', or: 'NotoSansOriya.ttf', as: 'NotoSansBengali.ttf',
  sa: 'NotoSansDevanagari.ttf', kok: 'NotoSansDevanagari.ttf', mni: 'NotoSansMeeteiMayek.ttf',
  ne: 'NotoSansDevanagari.ttf', brx: 'NotoSansDevanagari.ttf', doi: 'NotoSansDevanagari.ttf',
  sat: 'NotoSansOlChiki.ttf', mai: 'NotoSansDevanagari.ttf'
};
const RTL = new Set(['ur', 'ks', 'sd']);
const LABELS = {
  en: ['Bill', 'Bill Number', 'Bill Date', 'Customer Name', 'Wood Name', 'Quantity', 'Rate', 'Cutting Charge', 'Total Amount', 'Amount Paid', 'Balance to Pay', 'Payment Status', 'Paid', 'Partially Paid', 'Unpaid', 'Tax', 'Subtotal', 'Dimensions', 'Receipt'],
  kn: ['ಬಿಲ್', 'ಬಿಲ್ ಸಂಖ್ಯೆ', 'ಬಿಲ್ ದಿನಾಂಕ', 'ಗ್ರಾಹಕರ ಹೆಸರು', 'ಮರದ ಹೆಸರು', 'ಪ್ರಮಾಣ', 'ದರ', 'ಕತ್ತರಿಸುವ ಶುಲ್ಕ', 'ಒಟ್ಟು ಮೊತ್ತ', 'ಪಾವತಿಸಿದ ಮೊತ್ತ', 'ಪಾವತಿಸಬೇಕಾದ ಬಾಕಿ', 'ಪಾವತಿ ಸ್ಥಿತಿ', 'ಪಾವತಿಸಲಾಗಿದೆ', 'ಭಾಗಶಃ ಪಾವತಿ', 'ಪಾವತಿಸಿಲ್ಲ', 'ತೆರಿಗೆ', 'ಉಪಮೊತ್ತ', 'ಅಳತೆಗಳು', 'ರಸೀದಿ'],
  hi: ['बिल', 'बिल नंबर', 'बिल की तारीख', 'ग्राहक का नाम', 'लकड़ी का नाम', 'मात्रा', 'दर', 'कटाई शुल्क', 'कुल राशि', 'भुगतान राशि', 'बाकी राशि', 'भुगतान स्थिति', 'भुगतान हुआ', 'आंशिक भुगतान', 'भुगतान बाकी', 'कर', 'उप-योग', 'माप', 'रसीद'],
  te: ['బిల్లు', 'బిల్లు నంబర్', 'బిల్లు తేదీ', 'వినియోగదారుని పేరు', 'చెక్క పేరు', 'పరిమాణం', 'ధర', 'కోత ఛార్జీ', 'మొత్తం', 'చెల్లించిన మొత్తం', 'చెల్లించాల్సిన బాకీ', 'చెల్లింపు స్థితి', 'చెల్లించారు', 'పాక్షిక చెల్లింపు', 'చెల్లించలేదు', 'పన్ను', 'ఉప మొత్తం', 'కొలతలు', 'రసీదు'],
  ta: ['பில்', 'பில் எண்', 'பில் தேதி', 'வாடிக்கையாளர் பெயர்', 'மரத்தின் பெயர்', 'அளவு', 'விலை', 'அறுப்பு கட்டணம்', 'மொத்த தொகை', 'செலுத்திய தொகை', 'செலுத்த வேண்டிய மீதி', 'கட்டண நிலை', 'செலுத்தப்பட்டது', 'பகுதி கட்டணம்', 'செலுத்தப்படவில்லை', 'வரி', 'இடைத் தொகை', 'அளவுகள்', 'ரசீது'],
  ml: ['ബിൽ', 'ബിൽ നമ്പർ', 'ബിൽ തീയതി', 'ഉപഭോക്താവിന്റെ പേര്', 'മരത്തിന്റെ പേര്', 'അളവ്', 'നിരക്ക്', 'മുറിക്കൽ ചാർജ്', 'ആകെ തുക', 'അടച്ച തുക', 'അടയ്ക്കാനുള്ള ബാക്കി', 'പേയ്മെന്റ് നില', 'അടച്ചു', 'ഭാഗികമായി അടച്ചു', 'അടച്ചിട്ടില്ല', 'നികുതി', 'ഉപതുക', 'അളവുകൾ', 'രസീത്'],
  mr: ['बिल', 'बिल क्रमांक', 'बिल तारीख', 'ग्राहकाचे नाव', 'लाकडाचे नाव', 'प्रमाण', 'दर', 'कापणी शुल्क', 'एकूण रक्कम', 'भरलेली रक्कम', 'बाकी रक्कम', 'पेमेंट स्थिती', 'भरले', 'अंशतः भरले', 'भरले नाही', 'कर', 'उपएकूण', 'माप', 'पावती'],
  bn: ['বিল', 'বিল নম্বর', 'বিলের তারিখ', 'গ্রাহকের নাম', 'কাঠের নাম', 'পরিমাণ', 'দর', 'কাটার খরচ', 'মোট টাকা', 'জমা টাকা', 'বাকি টাকা', 'পেমেন্টের অবস্থা', 'পরিশোধিত', 'আংশিক পরিশোধিত', 'অপরিশোধিত', 'কর', 'উপমোট', 'মাপ', 'রসিদ'],
  gu: ['બિલ', 'બિલ નંબર', 'બિલ તારીખ', 'ગ્રાહકનું નામ', 'લાકડાનું નામ', 'જથ્થો', 'ભાવ', 'કાપવાનો ચાર્જ', 'કુલ રકમ', 'ચૂકવેલી રકમ', 'બાકી રકમ', 'ચુકવણી સ્થિતિ', 'ચૂકવેલ', 'આંશિક ચૂકવેલ', 'ચૂકવેલ નથી', 'કર', 'પેટાસરવાળો', 'માપ', 'રસીદ'],
  pa: ['ਬਿੱਲ', 'ਬਿੱਲ ਨੰਬਰ', 'ਬਿੱਲ ਦੀ ਮਿਤੀ', 'ਗਾਹਕ ਦਾ ਨਾਮ', 'ਲੱਕੜ ਦਾ ਨਾਮ', 'ਮਾਤਰਾ', 'ਦਰ', 'ਕਟਾਈ ਖਰਚਾ', 'ਕੁੱਲ ਰਕਮ', 'ਭਰੀ ਰਕਮ', 'ਬਾਕੀ ਰਕਮ', 'ਭੁਗਤਾਨ ਸਥਿਤੀ', 'ਭੁਗਤਾਨ ਹੋਇਆ', 'ਅੰਸ਼ਕ ਭੁਗਤਾਨ', 'ਭੁਗਤਾਨ ਬਾਕੀ', 'ਟੈਕਸ', 'ਉਪ-ਕੁੱਲ', 'ਮਾਪ', 'ਰਸੀਦ'],
  or: ['ବିଲ୍', 'ବିଲ୍ ନମ୍ବର', 'ବିଲ୍ ତାରିଖ', 'ଗ୍ରାହକଙ୍କ ନାମ', 'କାଠର ନାମ', 'ପରିମାଣ', 'ଦର', 'କଟା ଖର୍ଚ୍ଚ', 'ମୋଟ ରାଶି', 'ଦେୟ ରାଶି', 'ବାକି ରାଶି', 'ଦେୟ ସ୍ଥିତି', 'ଦିଆଯାଇଛି', 'ଆଂଶିକ ଦେୟ', 'ଦିଆଯାଇନାହିଁ', 'ଟିକସ', 'ଉପମୋଟ', 'ମାପ', 'ରସିଦ'],
  as: ['বিল', 'বিল নম্বৰ', 'বিলৰ তাৰিখ', 'গ্ৰাহকৰ নাম', 'কাঠৰ নাম', 'পৰিমাণ', 'দৰ', 'কটাৰ মাচুল', 'মুঠ ধন', 'দিয়া ধন', 'বাকী ধন', 'পৰিশোধৰ অৱস্থা', 'দিয়া হৈছে', 'আংশিক পৰিশোধ', 'দিয়া হোৱা নাই', 'কৰ', 'উপমুঠ', 'জোখ', 'ৰচিদ'],
  ne: ['बिल', 'बिल नम्बर', 'बिल मिति', 'ग्राहकको नाम', 'काठको नाम', 'परिमाण', 'दर', 'कटाइ शुल्क', 'जम्मा रकम', 'तिरेको रकम', 'तिर्न बाँकी', 'भुक्तानी अवस्था', 'तिरेको', 'आंशिक भुक्तानी', 'तिर्न बाँकी', 'कर', 'उपजम्मा', 'नाप', 'रसिद'],
  sa: ['क्रयपत्रम्', 'पत्राङ्कः', 'दिनाङ्कः', 'ग्राहकस्य नाम', 'काष्ठनाम', 'परिमाणम्', 'मूल्यम्', 'कर्तनशुल्कम्', 'कुलधनम्', 'दत्तधनम्', 'शेषधनम्', 'भुगतानस्थितिः', 'दत्तम्', 'आंशिकभुगतानम्', 'अदत्तम्', 'करः', 'उपयोगः', 'मापनम्', 'रसीद'],
  mai: ['बिल', 'बिल संख्या', 'बिल तिथि', 'ग्राहकक नाम', 'लकड़ीक नाम', 'मात्रा', 'दर', 'कटाइ शुल्क', 'कुल राशि', 'जमा राशि', 'बाकी राशि', 'भुगतान स्थिति', 'जमा', 'आंशिक भुगतान', 'बाकी', 'कर', 'उप-योग', 'माप', 'रसीद'],
  kok: ['बिल', 'बिल क्रमांक', 'बिल तारीख', 'गिरायकाचें नांव', 'लांकडाचें नांव', 'प्रमाण', 'दर', 'कापणी शुल्क', 'एकूण रक्कम', 'भरिल्ली रक्कम', 'बाकी रक्कम', 'फारीक स्थिती', 'फारीक', 'अंशतः फारीक', 'फारीक ना', 'कर', 'उपएकूण', 'माप', 'पावती'],
  brx: ['बिल', 'बिल नम्बर', 'बिल सान', 'ग्राहकनि मुं', 'दावनि मुं', 'रायजो', 'दाम', 'दाव लुनाय बिखा', 'गासै दाम', 'फुंनाय दाम', 'बाकि दाम', 'फुंनाय थाखो', 'फुंनाय', 'आथिं फुंनाय', 'फुंनाय नङा', 'टेक्स', 'आथिं गासै', 'माप', 'रसीद'],
  mni: ['ꯕꯤꯜ', 'ꯕꯤꯜ ꯅꯝꯕꯔ', 'ꯕꯤꯜ ꯇꯤꯊꯤ', 'ꯀꯥꯏꯕꯤꯒꯤ ꯃꯤꯡ', 'ꯎ ꯃꯤꯡ', 'ꯃꯈꯜ', 'ꯃꯃꯜ', 'ꯆꯤꯡꯊꯕ ꯆꯥꯔꯖ', 'ꯃꯄꯨꯡ ꯐꯥꯕ ꯃꯁꯤꯡ', 'ꯄꯤꯈ꯭ꯔꯕ ꯃꯁꯤꯡ', 'ꯄꯤꯒꯗꯕ ꯃꯁꯤꯡ', 'ꯄꯦꯃꯦꯟꯇ ꯁ꯭ꯇꯦꯇꯁ', 'ꯄꯤꯈ꯭ꯔꯦ', 'ꯑꯆꯧꯕ ꯄꯤꯈ꯭ꯔꯦ', 'ꯄꯤꯈ꯭ꯗꯦ', 'ꯇꯦꯛꯁ', 'ꯑꯄꯨꯟꯕ', 'ꯃꯥꯄ', 'ꯔꯦꯁꯤꯠ'],
  sat: ['ᱵᱤᱞ', 'ᱵᱤᱞ ᱱᱚᱢᱵᱚᱨ', 'ᱵᱤᱞ ᱢᱟᱹᱦᱤᱛ', 'ᱜᱟᱦᱟᱠ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ', 'ᱫᱟᱨᱩ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ', 'ᱯᱚᱨᱤᱢᱟᱱ', 'ᱫᱟᱢ', 'ᱜᱤᱰᱤ ᱪᱟᱨᱡᱽ', 'ᱢᱩᱴ ᱴᱟᱠᱟ', 'ᱮᱢ ᱴᱟᱠᱟ', 'ᱵᱟᱹᱠᱤ ᱴᱟᱠᱟ', 'ᱯᱮᱢᱮᱱᱴ ᱫᱚᱥᱟ', 'ᱮᱢ ᱮᱱᱟ', 'ᱟᱹᱰᱤ ᱮᱢ', 'ᱵᱟᱝ ᱮᱢ', 'ᱴᱮᱠᱥ', 'ᱵᱷᱟᱜᱽ ᱥᱟᱢᱜᱽ', 'ᱢᱟᱯ', 'ᱨᱮᱥᱤᱫ']
};
const BRAND = {
  name: process.env.MILL_NAME || 'Saw Mill', address: process.env.MILL_ADDRESS || '',
  phone: process.env.MILL_PHONE || '', email: process.env.MILL_EMAIL || '', taxId: process.env.MILL_TAX_ID || ''
};
const COLORS = { green: '#1b5e36', dark: '#0f3420', pale: '#e8f5ee', muted: '#59636e', border: '#d1d5db', red: '#991b1b', amber: '#92400e', paid: '#166534' };
const PAPER = { A4: 'A4', A5: 'A5', Letter: 'LETTER', Legal: 'LEGAL' };

function fontPathFor(language = 'en') {
  const code = String(language || 'en').toLowerCase();
  if (RTL.has(code)) throw pdfError('PDF_LANGUAGE_UNSUPPORTED', `PDF export does not yet support right-to-left text for ${code}. Choose another configured language or use an English bill.`);
  const filename = FONTS[code];
  if (!filename) throw pdfError('PDF_LANGUAGE_UNSUPPORTED', `PDF export does not support the selected language: ${code}.`);
  const fontPath = path.join(FONT_DIR, filename);
  if (!fs.existsSync(fontPath)) throw pdfError('PDF_FONT_MISSING', `The Unicode font for ${code} is missing. No PDF was generated.`);
  return fontPath;
}
function pdfError(code, message) { return Object.assign(new Error(message), { code, statusCode: 400 }); }
function labels(language) { return LABELS[language] || LABELS.en; }
function makeDoc(stream, language, paperSize, sampleText = []) {
  const fontPath = fontPathFor(language);
  const font = fontkit.openSync(fontPath);
  const text = ['₹', ...sampleText].join('');
  for (const character of text) {
    const point = character.codePointAt(0);
    if ([0x200c, 0x200d, 0xfe0e, 0xfe0f].includes(point)) continue;
    if (!font.hasGlyphForCodePoint(point)) {
      throw pdfError('PDF_FONT_GLYPH_MISSING', `The selected font cannot print U+${point.toString(16).toUpperCase()} for ${language}. No PDF was generated.`);
    }
  }
  const document = new PDFDocument({ size: PAPER[paperSize] || 'A4', margin: 36, autoFirstPage: true });
  document.registerFont('SawMill', fontPath);
  document.font('SawMill').pipe(stream);
  return document;
}
function money(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}
function write(doc, text, x, y, width, opts = {}) { doc.font('SawMill').text(String(text ?? ''), x, y, { width, ...opts }); }
function statusText(status, words) { return ({ paid: words[12], partially_paid: words[13], unpaid: words[14], voided: 'VOIDED' })[status] || words[14]; }
function brandLine(doc, x, y, width) {
  const details = [BRAND.name, BRAND.address, BRAND.phone, BRAND.email].filter(Boolean).join('  |  ');
  doc.fontSize(8).fillColor(COLORS.muted);
  write(doc, details, x, y, width, { align: 'center' });
}
function generateInvoicePdf(invoice, stream, options = {}) {
  const language = invoice.language_code || 'en';
  const words = labels(language);
  const rows = invoice.items || [];
  const doc = makeDoc(stream, language, options.paperSize || 'A4', [
    ...words, BRAND.name, BRAND.address, BRAND.phone, BRAND.email, BRAND.taxId,
    invoice.customer_name, invoice.invoice_number,
    ...rows.flatMap((item) => [item.localized_description, item.description, item.unit, item.dimensions_text]),
    invoice.notes
  ].filter(Boolean));
  const m = doc.page.margins.left;
  const width = doc.page.width - m * 2;
  const currency = invoice.currency || 'INR';
  const statusColor = invoice.payment_status === 'paid' ? COLORS.paid : invoice.payment_status === 'partially_paid' ? COLORS.amber : COLORS.red;
  doc.rect(m, 32, width, 4).fill(COLORS.green);
  doc.fontSize(19).fillColor(COLORS.dark);
  write(doc, BRAND.name, m, 45, width * 0.58, { bold: true });
  doc.fontSize(8).fillColor(COLORS.muted);
  write(doc, [BRAND.address, BRAND.phone, BRAND.email, BRAND.taxId].filter(Boolean).join('  |  '), m, 70, width * 0.58);
  doc.roundedRect(m + width * 0.63, 44, width * 0.37, 61, 5).fill(COLORS.pale).stroke(COLORS.border);
  doc.fontSize(9).fillColor(COLORS.dark);
  write(doc, words[0], m + width * 0.65, 50, width * 0.32, { bold: true });
  doc.fontSize(8).fillColor(COLORS.muted);
  write(doc, `${words[1]}: ${invoice.invoice_number}`, m + width * 0.65, 68, width * 0.32);
  write(doc, `${words[2]}: ${date(invoice.issue_date)}`, m + width * 0.65, 83, width * 0.32);
  doc.roundedRect(m, 113, width, 24, 4).fill(statusColor);
  doc.fontSize(10).fillColor('#ffffff');
  write(doc, `${words[11]}: ${statusText(invoice.payment_status, words)}`, m + 10, 119, width - 20, { bold: true });

  let y = 151;
  doc.roundedRect(m, y, width, 77, 4).fill('#f8fafc').stroke(COLORS.border);
  doc.fontSize(8).fillColor(COLORS.muted);
  write(doc, words[3], m + 10, y + 7, width - 20);
  doc.fontSize(12).fillColor('#111827');
  write(doc, invoice.customer_name || '', m + 10, y + 21, width - 20, { bold: true });
  const customerDetails = [
    invoice.company_name,
    [invoice.customer_address, invoice.customer_city].filter(Boolean).join(', '),
    [invoice.customer_phone, invoice.customer_email].filter(Boolean).join('  |  '),
    invoice.customer_tax_id ? `GSTIN: ${invoice.customer_tax_id}` : ''
  ].filter(Boolean);
  if (customerDetails.length) {
    doc.fontSize(7.5).fillColor(COLORS.muted);
    write(doc, customerDetails.slice(0, 3).join('  |  '), m + 10, y + 43, width - 20, { ellipsis: true });
    if (customerDetails[3]) write(doc, customerDetails[3], m + 10, y + 57, width - 20);
  }
  const source = [invoice.sales_order_number, invoice.cutting_job_number].filter(Boolean).join('  |  ');
  if (source) { doc.fontSize(7.5).fillColor(COLORS.muted); write(doc, source, m + 10, y + 67, width - 20, { ellipsis: true }); }
  y += 90;

  const col = { description: width * 0.40, quantity: width * 0.14, rate: width * 0.20, total: width * 0.26 };
  const header = (top) => {
    doc.rect(m, top, width, 25).fill(COLORS.green);
    doc.fontSize(8).fillColor('#ffffff');
    write(doc, `${words[4]} / ${words[17]}`, m + 7, top + 8, col.description - 8, { bold: true });
    write(doc, words[5], m + col.description, top + 8, col.quantity - 7, { bold: true, align: 'right' });
    write(doc, words[6], m + col.description + col.quantity, top + 8, col.rate - 7, { bold: true, align: 'right' });
    write(doc, words[8], m + col.description + col.quantity + col.rate, top + 8, col.total - 7, { bold: true, align: 'right' });
  };
  header(y);
  y += 25;
  rows.forEach((item, i) => {
    const hasDimensions = Boolean(item.dimensions_text);
    const rowHeight = hasDimensions ? 38 : 28;
    if (y + rowHeight > doc.page.height - 115) { doc.addPage(); y = 38; header(y); y += 25; }
    doc.rect(m, y, width, rowHeight).fill(i % 2 ? '#ffffff' : '#f8fafc').stroke(COLORS.border);
    doc.fontSize(9).fillColor('#111827');
    write(doc, item.localized_description || item.description || '', m + 7, y + 5, col.description - 12, { ellipsis: true });
    if (hasDimensions) { doc.fontSize(7.5).fillColor(COLORS.muted); write(doc, `${words[17]}: ${item.dimensions_text}`, m + 7, y + 21, col.description - 12, { ellipsis: true }); }
    write(doc, `${fmt(item.quantity)} ${item.unit || 'CFT'}`, m + col.description, y + 7, col.quantity - 7, { align: 'right' });
    write(doc, money(item.unit_price, currency), m + col.description + col.quantity, y + 7, col.rate - 7, { align: 'right' });
    write(doc, money(item.line_total, currency), m + col.description + col.quantity + col.rate, y + 7, col.total - 7, { align: 'right' });
    y += rowHeight;
  });

  y += 13;
  const totalsWidth = width * 0.54;
  const totalsX = m + width - totalsWidth;
  const cutCharge = Number(invoice.cutting_charge || 0);
  const totals = [
    [words[16], money(invoice.subtotal, currency)],
    ...(Number(invoice.discount_amount) > 0 ? [['Discount', `- ${money(invoice.discount_amount, currency)}`]] : []),
    ...(Number(invoice.tax_amount) > 0 ? [[`${words[15]} (${(Number(invoice.tax_rate || 0) * 100).toFixed(2)}%)`, money(invoice.tax_amount, currency)]] : []),
    ...(Number(invoice.additional_charges) > 0 ? [['Additional charges', money(invoice.additional_charges, currency)]] : []),
    ...(cutCharge > 0 ? [[words[7], money(cutCharge, currency)]] : [])
  ];
  totals.forEach(([label, value]) => {
    if (y + 20 > doc.page.height - 80) { doc.addPage(); y = 38; }
    doc.rect(totalsX, y, totalsWidth, 20).fill('#f8fafc').stroke(COLORS.border);
    doc.fontSize(8).fillColor(COLORS.muted); write(doc, label, totalsX + 7, y + 6, totalsWidth * 0.57);
    doc.fillColor('#111827'); write(doc, value, totalsX + totalsWidth * 0.55, y + 6, totalsWidth * 0.42, { align: 'right' });
    y += 20;
  });
  doc.rect(totalsX, y, totalsWidth, 26).fill(COLORS.green);
  doc.fontSize(9).fillColor('#ffffff'); write(doc, words[8], totalsX + 7, y + 8, totalsWidth * 0.55, { bold: true });
  write(doc, money(invoice.grand_total, currency), totalsX + totalsWidth * 0.55, y + 7, totalsWidth * 0.42, { bold: true, align: 'right' });
  y += 34;
  doc.fontSize(8).fillColor(COLORS.muted);
  write(doc, `${words[9]}: ${money(invoice.amount_paid, currency)}`, totalsX + 7, y, totalsWidth - 14);
  doc.fillColor(Number(invoice.amount_due) > 0 ? COLORS.red : COLORS.paid);
  write(doc, `${words[10]}: ${money(invoice.amount_due, currency)}`, totalsX + 7, y + 15, totalsWidth - 14, { bold: true });
  if (invoice.notes) { y += 38; doc.fontSize(8).fillColor(COLORS.muted); write(doc, invoice.notes, m, y, width); }
  doc.rect(m, doc.page.height - 70, width, 2).fill(COLORS.green);
  brandLine(doc, m, doc.page.height - 60, width);
  doc.end();
}

function generateReceiptPdf(invoice, payment, stream, options = {}) {
  const words = labels(invoice.language_code || 'en');
  const doc = makeDoc(stream, invoice.language_code || 'en', options.paperSize || 'A5', [
    ...words, BRAND.name, BRAND.address, BRAND.phone, BRAND.email, invoice.customer_name,
    invoice.invoice_number, payment.payment_number, payment.transaction_reference
  ].filter(Boolean));
  const m = doc.page.margins.left;
  const width = doc.page.width - m * 2;
  const currency = invoice.currency || 'INR';
  doc.rect(m, 32, width, 4).fill(COLORS.green);
  doc.fontSize(17).fillColor(COLORS.dark); write(doc, BRAND.name, m, 46, width, { bold: true });
  doc.fontSize(10).fillColor(COLORS.muted); write(doc, words[18], m, 72, width);
  const fields = [
    [words[1], invoice.invoice_number], [words[2], date(invoice.issue_date)],
    [words[3], invoice.customer_name || ''], ['Receipt Number', payment.payment_number || ''],
    ['Payment Date', date(payment.payment_date)], ['Method', (payment.payment_method || '').replaceAll('_', ' ')],
    ['Amount Paid', money(payment.amount, currency)], [words[8], money(invoice.grand_total, currency)],
    [words[10], money(payment.balance_after ?? invoice.amount_due, currency)],
    [words[11], statusText(invoice.payment_status, words)]
  ];
  let y = 101;
  fields.forEach(([label, value]) => {
    doc.roundedRect(m, y, width, 25, 3).fill('#f8fafc').stroke(COLORS.border);
    doc.fontSize(8).fillColor(COLORS.muted); write(doc, label, m + 8, y + 8, width * 0.48);
    doc.fillColor('#111827'); write(doc, value, m + width * 0.48, y + 8, width * 0.48 - 7, { align: 'right', bold: true });
    y += 29;
  });
  doc.rect(m, doc.page.height - 70, width, 2).fill(COLORS.green);
  brandLine(doc, m, doc.page.height - 60, width);
  doc.end();
}
function date(value) { return value ? String(value).slice(0, 10) : ''; }
function fmt(value) { return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }

module.exports = { generateInvoicePdf, generateReceiptPdf, fontPathFor, LABELS };
