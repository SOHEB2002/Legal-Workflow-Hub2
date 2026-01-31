import { useLocation } from "wouter";
import { Star, Clock, Briefcase, Users, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useFavorites, type FavoriteEntityType } from "@/lib/favorites-context";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const entityTypeIcons: Record<FavoriteEntityType, React.ReactNode> = {
  case: <Briefcase className="w-4 h-4" />,
  client: <Users className="w-4 h-4" />,
  consultation: <MessageSquare className="w-4 h-4" />,
};

const entityTypeLabels: Record<FavoriteEntityType, string> = {
  case: "قضية",
  client: "عميل",
  consultation: "استشارة",
};

const entityTypePaths: Record<FavoriteEntityType, string> = {
  case: "/cases",
  client: "/clients",
  consultation: "/consultations",
};

export function FavoritesDropdown() {
  const { favorites, removeFavorite } = useFavorites();
  const [, setLocation] = useLocation();

  const handleNavigate = (entityType: FavoriteEntityType) => {
    setLocation(entityTypePaths[entityType]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-favorites">
          <Star className="h-5 w-5" />
          {favorites.length > 0 && (
            <Badge 
              variant="secondary" 
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
            >
              {favorites.length}
            </Badge>
          )}
          <span className="sr-only">المفضلة</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          المفضلة
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {favorites.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            لا توجد عناصر في المفضلة
          </div>
        ) : (
          favorites.slice(0, 10).map((favorite) => (
            <DropdownMenuItem
              key={favorite.id}
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => handleNavigate(favorite.entityType)}
              data-testid={`favorite-item-${favorite.entityType}-${favorite.entityId}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {entityTypeIcons[favorite.entityType]}
                <span className="truncate">{favorite.entityTitle}</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  {entityTypeLabels[favorite.entityType]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFavorite(favorite.entityType, favorite.entityId);
                  }}
                  data-testid={`remove-favorite-${favorite.entityType}-${favorite.entityId}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RecentVisitsDropdown() {
  const { recentVisits, clearRecentVisits } = useFavorites();
  const [, setLocation] = useLocation();

  const handleNavigate = (entityType: FavoriteEntityType) => {
    setLocation(entityTypePaths[entityType]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-recent-visits">
          <Clock className="h-5 w-5" />
          <span className="sr-only">آخر الزيارات</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            آخر الزيارات
          </div>
          {recentVisits.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={clearRecentVisits}
              data-testid="button-clear-recent"
            >
              مسح الكل
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recentVisits.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            لا توجد زيارات حديثة
          </div>
        ) : (
          recentVisits.map((visit) => (
            <DropdownMenuItem
              key={visit.id}
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => handleNavigate(visit.entityType)}
              data-testid={`recent-item-${visit.entityType}-${visit.entityId}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {entityTypeIcons[visit.entityType]}
                <span className="truncate">{visit.entityTitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {entityTypeLabels[visit.entityType]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(visit.visitedAt), { addSuffix: true, locale: ar })}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
