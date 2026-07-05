"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { crm } from "./crm-api";

/** List a resource. Pass paginated=false for endpoints without pagination. */
export function useCrmList<T>(
  resource: string,
  params?: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["crm", resource, "list", params ?? {}],
    queryFn: () => crm.get<T>(`/${resource}/`, params),
    placeholderData: (previous) => previous,
  });
}

export function useCrmDetail<T>(
  resource: string,
  id: string | number | null | undefined,
) {
  return useQuery({
    queryKey: ["crm", resource, "detail", String(id)],
    queryFn: () => crm.get<T>(`/${resource}/${id}/`),
    enabled: id !== null && id !== undefined && id !== "new",
  });
}

/** Singleton endpoints (tax-config, site-config, stats). */
export function useCrmSingleton<T>(path: string) {
  return useQuery({
    queryKey: ["crm", path],
    queryFn: () => crm.get<T>(`/${path}/`),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (resource: string) =>
    qc.invalidateQueries({ queryKey: ["crm", resource] });
}

export function useCrmCreate<T, Body = Partial<T>>(resource: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Body) => crm.post<T>(`/${resource}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", resource] }),
  });
}

export function useCrmUpdate<T, Body = Partial<T>>(resource: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Body }) =>
      crm.patch<T>(`/${resource}/${id}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", resource] }),
  });
}

export function useCrmDelete(resource: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => crm.delete(`/${resource}/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", resource] }),
  });
}
