// Utilitário de PDF padronizado do Oliver (usa jsPDF já carregado)
// Desenha um cabeçalho de marca e retorna a posição Y inicial do conteúdo.
window.oliverPdfHeader = function (pdf, titulo, subtitulo) {
    const w = pdf.internal.pageSize.getWidth();
    // Faixa laranja
    pdf.setFillColor(249, 115, 22);        // orange-500
    pdf.rect(0, 0, w, 26, "F");
    // Detalhe âmbar
    pdf.setFillColor(245, 158, 11);        // amber-500
    pdf.rect(0, 26, w, 1.5, "F");
    // Marca
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(19);
    pdf.text("Oliver", 14, 17);
    // Título do documento (à direita)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(String(titulo || ""), w - 14, 13, { align: "right" });
    if (subtitulo) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.text(String(subtitulo), w - 14, 19, { align: "right" });
    }
    // Reset para o conteúdo
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");
    return 38;
};

// Carimba um rodapé de marca em todas as páginas.
window.oliverPdfFooter = function (pdf) {
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const total = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(225, 225, 225);
        pdf.setLineWidth(0.3);
        pdf.line(14, h - 14, w - 14, h - 14);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text("Gerado pelo Oliver · " + new Date().toLocaleString("pt-BR"), 14, h - 9);
        pdf.text("Pág. " + i + "/" + total, w - 14, h - 9, { align: "right" });
    }
    pdf.setTextColor(0, 0, 0);
};
