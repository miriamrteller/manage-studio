import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DETAIL_TOKEN_RE, liveDetailLabel, liveDetailOptions, type LegalLang } from '@/legal/render';
import type { VerticalId } from '@shared/config/tenant-presets';

const TOKEN_SPLIT = /(\{\{detail:[a-z_]+\}\})/g;
const TOKEN_ONE = /^\{\{detail:([a-z_]+)\}\}$/;

/** A non-editable chip for one live detail. */
function chip(doc: Document, id: string, lang: LegalLang): HTMLSpanElement {
  const el = doc.createElement('span');
  el.setAttribute('contenteditable', 'false');
  el.dataset.detail = id;
  el.className = 'legal-detail-chip';
  el.setAttribute('role', 'img');
  const label = liveDetailLabel(id, lang);
  el.setAttribute('aria-label', lang === 'he' ? `פרט מההגדרות: ${label}` : `Detail from settings: ${label}`);
  el.textContent = label;
  return el;
}

/** Text with {{detail:…}} tokens → DOM nodes (text + chips; newlines kept as text). */
function fill(root: HTMLElement, text: string, lang: LegalLang) {
  root.replaceChildren();
  for (const part of text.split(TOKEN_SPLIT)) {
    if (!part) continue;
    const m = TOKEN_ONE.exec(part);
    root.append(m ? chip(root.ownerDocument, m[1], lang) : root.ownerDocument.createTextNode(part));
  }
}

/** DOM → text with tokens. Browsers add <br> and <div> for new lines. */
export function serialiseDetailEditor(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
    } else if (child instanceof HTMLElement) {
      if (child.dataset.detail) out += `{{detail:${child.dataset.detail}}}`;
      else if (child.tagName === 'BR') out += '\n';
      else {
        const block = child.tagName === 'DIV' || child.tagName === 'P';
        if (block && out && !out.endsWith('\n')) out += '\n';
        out += serialiseDetailEditor(child);
      }
    }
  });
  return out;
}

/** Insert text (which may hold tokens) at the caret, as text nodes and chips. */
function insertAtCaret(root: HTMLElement, text: string, lang: LegalLang) {
  const sel = root.ownerDocument.getSelection();
  const frag = root.ownerDocument.createDocumentFragment();
  const holder = root.ownerDocument.createElement('div');
  fill(holder, text, lang);
  const last = holder.lastChild;
  while (holder.firstChild) frag.append(holder.firstChild);
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else {
    root.append(frag);
  }
}

/**
 * The lawyer-version editor. The studio's details are chips: highlighted,
 * labelled, never retyped. They can be deleted, cut and pasted, or dragged,
 * and new ones added with "Insert a detail". The text is stored with
 * {{detail:…}} tokens and filled from Settings when shown.
 */
export function LiveDetailEditor(props: {
  id: string;
  labelledBy: string;
  describedBy?: string;
  value: string;
  onChange: (value: string) => void;
  language: LegalLang;
  vertical: VerticalId;
  /** Turns pasted plain text's known values into details; returns the converted text. */
  onPasteText?: (text: string) => string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const lastEmitted = useRef<string | null>(null);
  const [detail, setDetail] = useState('');
  const options = liveDetailOptions(props.vertical, props.language);

  // Rebuild the DOM only when the value changes from outside (not on each keystroke).
  useEffect(() => {
    if (ref.current && props.value !== lastEmitted.current) {
      fill(ref.current, props.value, props.language);
      lastEmitted.current = props.value;
    }
  }, [props.value, props.language]);

  const emit = () => {
    if (!ref.current) return;
    const text = serialiseDetailEditor(ref.current);
    lastEmitted.current = text;
    props.onChange(text);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.clipboardData.getData('text/plain');
    const text = props.onPasteText ? props.onPasteText(raw) : raw;
    if (ref.current) insertAtCaret(ref.current, text, props.language);
    emit();
  };

  // Copy and cut keep the chips as tokens, so pasting them moves the detail.
  const onCopy = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const holder = document.createElement('div');
    holder.append(sel.getRangeAt(0).cloneContents());
    e.clipboardData.setData('text/plain', serialiseDetailEditor(holder));
    e.preventDefault();
    if (cut) {
      sel.getRangeAt(0).deleteContents();
      emit();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter: a plain new line (no browser <div> wrappers).
    if (e.key === 'Enter') {
      e.preventDefault();
      if (ref.current) insertAtCaret(ref.current, '\n', props.language);
      emit();
    }
  };

  const insertDetail = () => {
    if (!detail || !ref.current) return;
    ref.current.focus();
    insertAtCaret(ref.current, `{{detail:${detail}}}`, props.language);
    emit();
  };

  return (
    <div className="space-y-2">
      <div
        id={props.id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={props.labelledBy}
        aria-describedby={props.describedBy}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        dir={props.language === 'he' ? 'rtl' : 'ltr'}
        lang={props.language}
        className="form-input min-h-[12rem] w-full whitespace-pre-wrap font-mono text-sm"
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onCopy={(e) => onCopy(e, false)}
        onCut={(e) => onCopy(e, true)}
        onKeyDown={onKeyDown}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={pickerId} className="text-sm">
          {t('legal.lawyer.insert_detail')}
        </label>
        <select id={pickerId} className="form-input w-auto" value={detail} onChange={(e) => setDetail(e.target.value)}>
          <option value="">{t('legal.lawyer.insert_detail_choose')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={insertDetail} disabled={!detail}>
          {t('legal.lawyer.insert_detail_action')}
        </Button>
      </div>
    </div>
  );
}

/** Count of live details in a text (for the "details stay live" summary). */
export function countLiveDetails(text: string): number {
  return (text.match(DETAIL_TOKEN_RE) ?? []).length;
}
