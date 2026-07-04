import { useAuth } from "@/components/auth/AuthProvider";

export function useCanEdit(): boolean {
  const { user } = useAuth();
  return user?.role !== "viewer";
}
