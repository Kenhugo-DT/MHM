export function loadAllRows<T extends { id: string }>(
  fetchPage: (afterId: string | undefined, pageSize: number) => Promise<T[]>,
  pageSize?: number,
): Promise<T[]>;
