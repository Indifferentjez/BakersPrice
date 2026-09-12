// Tiny inline icon set — no npm dependency. 16/20px, 1.75 stroke, round caps.
// Used sparingly: hamburger, empty states, estimate banner. Not on every row.

function Icon({ size = 20, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconMenu(props) {
  return (
    <Icon {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Icon>
  );
}

export function IconClose(props) {
  return (
    <Icon {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Icon>
  );
}

export function IconPlus(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

export function IconFile(props) {
  return (
    <Icon {...props}>
      <path d="M14 3v5h5" />
      <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </Icon>
  );
}

export function IconReceipt(props) {
  return (
    <Icon {...props}>
      <path d="M5 3l1.6 1.5L8.3 3l1.7 1.5L11.7 3l1.6 1.5L15 3l1.7 1.5L18 3v18l-1.3-1.4-1.7 1.4-1.6-1.4-1.7 1.4-1.7-1.4-1.6 1.4L6.3 19.6 5 21Z" />
      <line x1="8" y1="9" x2="15" y2="9" />
      <line x1="8" y1="13" x2="15" y2="13" />
    </Icon>
  );
}

export function IconAlert(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 2 20h20L12 3Z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <line x1="12" y1="17.5" x2="12" y2="17.5" />
    </Icon>
  );
}

export function IconSearch(props) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </Icon>
  );
}

export function IconEye(props) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function IconEyeOff(props) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 3-3 3 3 0 0 0-.4-1.5" />
      <path d="M6.7 6.8C4.2 8.3 2.5 10.5 2 12c0 0 3.5 7 10 7 1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.3 17.2C19.8 15.7 21.5 13.5 22 12c0 0-3.5-7-10-7-1.1 0-2.1.2-3.1.5" />
    </Icon>
  );
}
