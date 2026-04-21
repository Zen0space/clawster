import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useHealthz() {
  return useQuery({
    queryKey: ["healthz"],
    queryFn: async () => {
      const result = await api.ping();
      console.log("[desktop] backend connected:", result);
      return result;
    },
    retry: false,
  });
}
