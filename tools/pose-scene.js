import { drawPose, initialPose } from './pose.js';

export function newPerson(number, offset = 0) {
    return {
        id: 'P' + number,
        name: number === 1 ? 'Char' : number === 2 ? 'User' : '人物 ' + number,
        color: number === 1 ? '#ffae70' : number === 2 ? '#67d9d0' : 'hsl(' + Math.round(number * 137.508 % 360) + ' 75% 72%)',
        points: initialPose().map(([x, y]) => [x + offset, y]),
    };
}

export function isClassicPose(people) {
    return people.length === 1 && people[0].id === 'P1' && people[0].name === 'Char';
}

export function drawScene(ctx, people, active, joint = -1) {
    const classic = isClassicPose(people);
    function draw(person) {
        drawPose(ctx, person.points, person === active ? joint : -1, classic ? undefined : person.color);
    }
    for (const person of people) if (person !== active) draw(person);
    if (active) draw(active);
}

// The top 800 × 880 pixels always use the same coordinates as the JSON.
// Isolated views retain that projection, including when two skeletons coincide.
export function renderSceneImage(canvas, people) {
    const classic = isClassicPose(people);
    canvas.width = 800;
    const tileHeight = 396;
    canvas.height = 880 + (classic ? 0 : 44 + Math.ceil(people.length / 2) * tileHeight);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17232a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(2, 2);
    drawScene(ctx, people);
    ctx.restore();
    if (classic) return;
    ctx.fillStyle = '#f3f3ee';
    ctx.font = '22px sans-serif';
    ctx.fillText('Front view   ·   Solid: right / center   ·   Dashed: left', 16, 910);
    people.forEach((person, i) => {
        ctx.save();
        ctx.translate((i % 2) * 400, 924 + Math.floor(i / 2) * tileHeight);
        ctx.strokeStyle = '#465860';
        ctx.strokeRect(1, 1, 398, tileHeight - 2);
        ctx.fillStyle = person.color;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(person.id + ' · ' + person.name, 12, 30, 376);
        ctx.translate(40, 36);
        ctx.scale(.8, .8);
        drawPose(ctx, person.points, -1, person.color);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        for (const [index, label] of [[4, 'R'], [7, 'L']]) {
            const [x, y] = person.points[index];
            ctx.fillText(label, x + (index === 4 ? -20 : 9), y - 6);
        }
        ctx.restore();
    });
}
