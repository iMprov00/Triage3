import { useState } from "react";
import Stage1ChecklistModal from "./Stage1ChecklistModal";

type Props = {
  patientId: number;
  className?: string;
};

export default function Stage1ChecklistButton({ patientId, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className || "btn btn-outline-secondary btn-sm"}
        onClick={() => setOpen(true)}
      >
        <i className="bi bi-list-check me-1" aria-hidden />
        Посмотреть чек-лист этапа 1
      </button>
      <Stage1ChecklistModal patientId={patientId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
