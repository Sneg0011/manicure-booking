'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type SelectMenuOption = { value: string; label: string; note?: string; hint?: string };

export function SelectMenu(props: {
  name: string;
  label: string;
  options: SelectMenuOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  tone?: 'dark' | 'light';
}) {
  const { name, label, options, value, defaultValue, onChange, required, tone = 'light' } = props;
  const [hydrated, setHydrated] = useState(false);
  const [ownValue, setOwnValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const listId = `${id}-list`;
  const selectedValue = value !== undefined ? value : ownValue;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selected = options[selectedIndex];

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      // Подпись поля считаем своей: её клик сам закроет список через кнопку.
      const field = rootRef.current?.closest('label') ?? rootRef.current;
      if (!field?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current?.getBoundingClientRect();
    const list = listRef.current;
    if (!button || !list) return;
    const below = window.innerHeight - button.bottom;
    const above = button.top;
    setSide(below < list.getBoundingClientRect().height + 10 && above > below ? 'top' : 'bottom');
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    // Двигаем только сам список: scrollIntoView прокручивал бы и всю страницу.
    const list = listRef.current;
    const option = list?.querySelectorAll('li')[active];
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [open, active]);

  const change = (nextValue: string) => {
    if (value === undefined) setOwnValue(nextValue);
    onChange?.(nextValue);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) change(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const openAt = (index: number) => {
    setActive(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  };

  const search = (letter: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchRef.current += letter.toLocaleLowerCase();
    const find = (query: string) =>
      options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(query));
    let match = find(searchRef.current);
    if (match < 0) {
      searchRef.current = letter.toLocaleLowerCase();
      match = find(searchRef.current);
    }
    if (match >= 0) openAt(match);
    else if (!open) openAt(selectedIndex);
    searchTimerRef.current = setTimeout(() => {
      searchRef.current = '';
    }, 500);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    if (key === 'Tab') {
      if (open) {
        const option = options[active];
        if (option) change(option.value);
        setOpen(false);
      }
      return;
    }
    if (key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else openAt(selectedIndex);
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (open)
        setActive((current) =>
          Math.max(0, Math.min(options.length - 1, current + (key === 'ArrowDown' ? 1 : -1))),
        );
      else openAt(selectedIndex);
      return;
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      openAt(key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      search(key);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`select-menu select-menu-${tone}`}
      data-open={open}
      data-side={side}
    >
      {hydrated && (
        <button
          ref={buttonRef}
          type="button"
          role="combobox"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${id}-option-${active}` : undefined}
          onClick={() => {
            if (open) setOpen(false);
            else openAt(selectedIndex);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="select-menu-button"
        >
          <span className="select-menu-current">{selected?.label ?? ''}</span>
          <svg
            className="select-menu-chevron"
            width="12"
            height="8"
            viewBox="0 0 12 8"
            fill="none"
            aria-hidden="true"
          >
            <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      )}
      <select
        name={name}
        required={required}
        value={selectedValue}
        onChange={(event) => change(event.target.value)}
        className={hydrated ? 'select-menu-native' : undefined}
        tabIndex={hydrated ? -1 : undefined}
        aria-hidden={hydrated ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hydrated && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="select-menu-list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={selectedValue === option.value}
              className="select-menu-option"
              data-active={active === index}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="select-menu-nail" aria-hidden="true" />
              <span className="select-menu-copy">
                <span>{option.label}</span>
                {option.note && <small>{option.note}</small>}
              </span>
              {option.hint && <span className="select-menu-hint">{option.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
