export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}
