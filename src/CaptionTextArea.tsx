import { useState, type TextareaHTMLAttributes } from 'react';

/** Commit line rewrites on blur; external script/undo changes display synchronously. */
export default function CaptionTextArea({
  value,
  onCommit,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [edit, setEdit] = useState({ source: value, draft: value });
  if (edit.source !== value) setEdit({ source: value, draft: value });
  const draft = edit.source === value ? edit.draft : value;
  return (
    <textarea
      {...props}
      value={draft}
      onChange={(e) => setEdit({ source: value, draft: e.target.value })}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
