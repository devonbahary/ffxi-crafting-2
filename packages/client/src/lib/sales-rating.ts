export type SalesRating = 'Very Fast' | 'Fast' | 'Average' | 'Slow' | 'Very Slow' | 'Dead Slow';

export const getSalesRating = (salesPerDay: number): SalesRating => {
    if (salesPerDay >= 8) return 'Very Fast';
    if (salesPerDay >= 4) return 'Fast';
    if (salesPerDay >= 1) return 'Average';
    if (salesPerDay >= 1 / 7) return 'Slow';
    if (salesPerDay >= 1 / 30) return 'Very Slow';
    return 'Dead Slow';
};
