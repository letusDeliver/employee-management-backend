export type UserSortField = 'name' | 'email' | 'createdAt';

export interface UserListQuery {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  sortBy: UserSortField;
  order: 'asc' | 'desc';
}
