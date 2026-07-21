interface StickerAnchorProps {
  sectionId: string;
  sectionTitle: string;
  onAdd: () => void;
}

export function StickerAnchor({ sectionId, sectionTitle, onAdd }: StickerAnchorProps) {
  return (
    <button
      type="button"
      className="rb-sticker-anchor rb-print-hidden"
      data-rb-sticker-anchor={sectionId}
      aria-label={`Add sticker to section: ${sectionTitle}`}
      title="Attach a private note to this section"
      onClick={onAdd}
    >
      <span aria-hidden="true">＋</span>
      <span>Add sticker</span>
    </button>
  );
}
