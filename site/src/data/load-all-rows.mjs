export async function loadAllRows(fetchPage, pageSize = 500) {
  const rows = [];
  const seenIds = new Set();
  let afterId;

  while (true) {
    const page = await fetchPage(afterId, pageSize);
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error("Invalid graph page response.");
    }
    for (const row of page) {
      if (!row?.id || seenIds.has(row.id)) {
        throw new Error("Graph pagination did not advance.");
      }
      seenIds.add(row.id);
      rows.push(row);
    }
    if (page.length) afterId = page[page.length - 1].id;
    if (page.length < pageSize) return rows;
  }
}
