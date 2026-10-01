import type { StationSourceInput, TransitProvider } from '../domain/bus-stop';

export type NearbyStationProvider = {
  provider: TransitProvider;
  fetchNearby(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<StationSourceInput[]>;
};

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}
