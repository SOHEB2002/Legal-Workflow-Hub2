import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites, type FavoriteEntityType } from "@/lib/favorites-context";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FavoriteButtonProps {
  entityType: FavoriteEntityType;
  entityId: string;
  entityTitle: string;
  className?: string;
}

export function FavoriteButton({
  entityType,
  entityId,
  entityTitle,
  className,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(entityType, entityId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(entityType, entityId, entityTitle);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          onClick={handleClick}
          data-testid={`favorite-btn-${entityType}-${entityId}`}
        >
          <Star
            className={cn(
              "h-4 w-4",
              isFav ? "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" : "text-muted-foreground"
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
      </TooltipContent>
    </Tooltip>
  );
}
