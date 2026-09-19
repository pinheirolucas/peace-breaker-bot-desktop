import type { ButtonHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import InstantCard from "./InstantCard";
import type { InstantCardProps, OrganizeProps } from "./InstantCard";

export interface SortableInstantCardProps extends Omit<InstantCardProps, "organize"> {
  organize: Pick<OrganizeProps, "position" | "total" | "onRename">;
}

/**
 * InstantCard wired to dnd-kit. The card stays a plain component (it is
 * also drawn in the overlay, which must not register as a second sortable),
 * and this is the only place that knows about the library.
 */
export default function SortableInstantCard({ organize, ...card }: SortableInstantCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: card.instant.url,
    attributes: { roleDescription: t("dnd.roleDescription") }
  });

  return (
    <InstantCard
      {...card}
      organize={{
        ...organize,
        drag: isDragging ? "ghost" : undefined,
        rootRef: setNodeRef,
        handleRef: setActivatorNodeRef,
        handleProps: {
          ...(attributes as ButtonHTMLAttributes<HTMLButtonElement>),
          ...(listeners as ButtonHTMLAttributes<HTMLButtonElement>)
        },
        style: { transform: CSS.Transform.toString(transform), transition }
      }}
    />
  );
}
