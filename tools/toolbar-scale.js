const minScale = 75;
const maxScale = 150;

export function getToolbarScale(config) {
    const { scale } = config;
    return Number.isFinite(scale) && scale >= minScale && scale <= maxScale ? scale : 100;
}

export function createToolbarScaleSetting(config, labelText) {
    const label = document.createElement('label');
    label.className = 'flex-container flexFlowColumn';
    const text = document.createElement('span');
    const scale = document.createElement('input');
    scale.type = 'range';
    scale.min = String(minScale);
    scale.max = String(maxScale);
    scale.step = '5';
    scale.value = String(getToolbarScale(config));

    const updateLabel = () => {
        text.textContent = `${labelText} ${scale.value}%`;
        scale.setAttribute('aria-valuetext', `${scale.value}%`);
    };
    updateLabel();
    scale.addEventListener('input', () => {
        config.scale = scale.valueAsNumber;
        updateLabel();
    });
    label.append(text, scale);
    return label;
}
