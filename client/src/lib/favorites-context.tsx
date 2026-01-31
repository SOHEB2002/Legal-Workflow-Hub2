import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type FavoriteEntityType = "case" | "client" | "consultation";

export interface Favorite {
  id: string;
  entityType: FavoriteEntityType;
  entityId: string;
  entityTitle: string;
  createdAt: string;
}

export interface RecentVisit {
  id: string;
  entityType: FavoriteEntityType;
  entityId: string;
  entityTitle: string;
  visitedAt: string;
}

interface FavoritesContextType {
  favorites: Favorite[];
  recentVisits: RecentVisit[];
  addFavorite: (entityType: FavoriteEntityType, entityId: string, entityTitle: string) => void;
  removeFavorite: (entityType: FavoriteEntityType, entityId: string) => void;
  isFavorite: (entityType: FavoriteEntityType, entityId: string) => boolean;
  toggleFavorite: (entityType: FavoriteEntityType, entityId: string, entityTitle: string) => void;
  addRecentVisit: (entityType: FavoriteEntityType, entityId: string, entityTitle: string) => void;
  clearRecentVisits: () => void;
  getFavoritesByType: (entityType: FavoriteEntityType) => Favorite[];
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const FAVORITES_STORAGE_KEY = "lawfirm_favorites";
const RECENT_VISITS_STORAGE_KEY = "lawfirm_recent_visits";
const MAX_RECENT_VISITS = 10;

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Favorite[]>(() => {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>(() => {
    const stored = localStorage.getItem(RECENT_VISITS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(RECENT_VISITS_STORAGE_KEY, JSON.stringify(recentVisits));
  }, [recentVisits]);

  const addFavorite = useCallback((entityType: FavoriteEntityType, entityId: string, entityTitle: string) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.entityType === entityType && f.entityId === entityId);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: `${entityType}-${entityId}`,
          entityType,
          entityId,
          entityTitle,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeFavorite = useCallback((entityType: FavoriteEntityType, entityId: string) => {
    setFavorites(prev => prev.filter(f => !(f.entityType === entityType && f.entityId === entityId)));
  }, []);

  const isFavorite = useCallback((entityType: FavoriteEntityType, entityId: string) => {
    return favorites.some(f => f.entityType === entityType && f.entityId === entityId);
  }, [favorites]);

  const toggleFavorite = useCallback((entityType: FavoriteEntityType, entityId: string, entityTitle: string) => {
    if (isFavorite(entityType, entityId)) {
      removeFavorite(entityType, entityId);
    } else {
      addFavorite(entityType, entityId, entityTitle);
    }
  }, [isFavorite, removeFavorite, addFavorite]);

  const addRecentVisit = useCallback((entityType: FavoriteEntityType, entityId: string, entityTitle: string) => {
    setRecentVisits(prev => {
      const filtered = prev.filter(v => !(v.entityType === entityType && v.entityId === entityId));
      const newVisit: RecentVisit = {
        id: `${entityType}-${entityId}-${Date.now()}`,
        entityType,
        entityId,
        entityTitle,
        visitedAt: new Date().toISOString(),
      };
      return [newVisit, ...filtered].slice(0, MAX_RECENT_VISITS);
    });
  }, []);

  const clearRecentVisits = useCallback(() => {
    setRecentVisits([]);
  }, []);

  const getFavoritesByType = useCallback((entityType: FavoriteEntityType) => {
    return favorites.filter(f => f.entityType === entityType);
  }, [favorites]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        recentVisits,
        addFavorite,
        removeFavorite,
        isFavorite,
        toggleFavorite,
        addRecentVisit,
        clearRecentVisits,
        getFavoritesByType,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
