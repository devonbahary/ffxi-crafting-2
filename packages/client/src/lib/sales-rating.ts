export type SalesRating = 'Very Fast' | 'Fast' | 'Average' | 'Slow' | 'Very Slow' | 'Dead Slow';

export const getSalesRating = (salesPerDay: number): SalesRating => {
    if (salesPerDay >= 8) return 'Very Fast';
    if (salesPerDay >= 4) return 'Fast';
    if (salesPerDay >= 1) return 'Average';
    if (salesPerDay >= 1 / 7) return 'Slow';
    if (salesPerDay >= 1 / 30) return 'Very Slow';
    return 'Dead Slow';
};

const RATING_COLORS: Record<SalesRating, string> = {
    'Very Fast': 'text-green-500',
    Fast: 'text-lime-500',
    Average: 'text-yellow-500',
    Slow: 'text-orange-500',
    'Very Slow': 'text-red-600',
    'Dead Slow': 'text-red-950',
};

export const getRatingColor = (rating: SalesRating): string => RATING_COLORS[rating];
