/**
 * Options de pagination.
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Métadonnées de pagination.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Calcule les paramètres de pagination
 * à partir des paramètres de requête.
 */
export function getPagination(
  page?: string,
  limit?: string
): PaginationOptions {
  const currentPage = Math.max(Number.parseInt(page || "1", 10), 1);

  const currentLimit = Math.min(
    Math.max(Number.parseInt(limit || "10", 10), 1),
    100
  );

  return {
    page: currentPage,
    limit: currentLimit,
    skip: (currentPage - 1) * currentLimit,
  };
}

/**
 * Construit les informations de pagination
 * à retourner dans les réponses API.
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}