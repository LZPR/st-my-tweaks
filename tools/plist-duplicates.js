export function repeated(values) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
        if (!value) continue;
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return duplicates;
}

export function markDuplicate(control, duplicate, description) {
    control.classList.toggle('pl-duplicate', duplicate);
    if (duplicate) control.setAttribute('aria-description', description);
    else control.removeAttribute('aria-description');
}
