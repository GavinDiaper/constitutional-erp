import * as d3 from 'd3';
import type { TimelineEvent } from '$lib/types/hub';

const severityColors: Record<string, string> = {
	low: '#7bd88f',
	medium: '#ffd166',
	high: '#e00000'
};

export function renderEventTimeline(svgEl: SVGSVGElement, events: TimelineEvent[]): void {
	const width = svgEl.clientWidth || 820;
	const height = 280;

	const svg = d3.select(svgEl);
	svg.selectAll('*').remove();
	svg.attr('viewBox', `0 0 ${width} ${height}`);

	if (events.length === 0) {
		svg
			.append('text')
			.attr('x', width / 2)
			.attr('y', height / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', '#d9e3ee')
			.text('No event timeline available');
		return;
	}

	const parsedEvents = events.map((event, index) => ({
		...event,
		parsedTime: new Date(event.timestamp),
		index
	}));

	const xScale = d3
		.scaleTime()
		.domain(d3.extent(parsedEvents, (event) => event.parsedTime) as [Date, Date])
		.range([50, width - 40]);

	const yScale = d3.scaleBand().domain(parsedEvents.map((event) => event.id)).range([40, height - 40]).padding(0.35);

	svg
		.append('line')
		.attr('x1', 50)
		.attr('x2', width - 40)
		.attr('y1', height - 30)
		.attr('y2', height - 30)
		.attr('stroke', '#d9e3ee')
		.attr('stroke-width', 1);

	svg
		.append('g')
		.selectAll('circle')
		.data(parsedEvents)
		.join('circle')
		.attr('cx', (event) => xScale(event.parsedTime))
		.attr('cy', (event) => (yScale(event.id) ?? 0) + yScale.bandwidth() / 2)
		.attr('r', 7)
		.attr('fill', (event) => severityColors[event.severity ?? 'low'])
		.append('title')
		.text((event) => `${event.category}: ${event.message}`);

	svg
		.append('g')
		.selectAll('text')
		.data(parsedEvents)
		.join('text')
		.attr('x', (event) => xScale(event.parsedTime) + 10)
		.attr('y', (event) => (yScale(event.id) ?? 0) + yScale.bandwidth() / 2 + 4)
		.attr('fill', '#ffffff')
		.attr('font-size', 11)
		.text((event) => event.category);
}
