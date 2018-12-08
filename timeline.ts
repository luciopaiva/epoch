/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="index.ts" />

module Epoch {

    /**
     * This is a D3.js plugin to show a timeline chart. The timeline is draggable and zoomable.
     */
    export namespace TimelinePlugin {

        import Moment = moment.Moment;

        const
            EVENT_CLASS_NAME = 'timeline-event',
            EVENT_LANE_CLASS_NAME = 'timeline-lane',
            EVENT_LANE_LABEL_CLASS_NAME = 'timeline-lane-label',
            EVENT_LANE_SEPARATOR_CLASS_NAME = 'timeline-lane-separator',
            EVENT_INSTANT_CLASS_NAME = 'timeline-event-instant',
            HORIZONTAL_AXIS_CLASS_NAME = 'timeline-horizontal-axis',
            LINE_CURRENT_DATE_CLASS_NAME = 'timeline-current-date',
            FUTURE_CLASS_NAME = 'timeline-future',
            CHART_LATERAL_PADDING_IN_YEARS = 10,
            EVENT_VERTICAL_MARGIN = 5,
            EVENT_HEIGHT = 17,
            EVENT_TITLE_X = 10,
            EVENT_TITLE_Y = 12,
            EVENT_HEIGHT_PLUS_MARGIN = EVENT_HEIGHT + EVENT_VERTICAL_MARGIN,
            EVENT_RIGHT_MARGIN_IN_YEARS = 20;

        type Interval = [Moment, Moment];

        export interface TimelineChart {
            (selection: d3.Selection<any>): void;
        }

        const enum TimeEventKind {
            Instant = 1,
            Interval
        }

        /**
         * Simple pojo representing a time event
         */
        export class TimeEvent {
            public static VALID_DATE_FORMATS: (string|(()=>void))[] = [moment.ISO_8601, 'YYYY-MM-DD', 'YYYY'];
            public kind: TimeEventKind;
            public begin: Moment;
            public end: Moment;
            public hasNoEnd: boolean;

            /**
             * Creates a pojo representing a time event.
             *
             * @param id unique identifier of the event
             * @param series which series contains this event
             * @param kind the kind of the event
             * @param title a short description, meant to be displayed in the timeline
             * @param begin date when the event begins, ISO format
             * @param end date when the event ends, ISO format
             * @param description a longer description of the event
             * @param url URL associated with the event
             */
            constructor(public id: number, public series: string, kind: string, public title: string,
                        begin: string, end: string, public description: string, public url: string) {
                this.kind = parseInt(kind, 10);
                this.begin = TimeEvent.strToMoment(begin);
                this.end = TimeEvent.strToMoment(end);
                this.hasNoEnd = this.end === null;
            }

            public static strToMoment(date: string): Moment {
                let
                    result: Moment = null;

                if (typeof date == 'string' && date.length > 0) {
                    result = moment(date, TimeEvent.VALID_DATE_FORMATS, true);
                }

                return result !== null && result.isValid() ? result : null;
            }

            /**
             * @param event event to be uniquely identified
             * @returns {string} returns a unique identifier for the event passed
             */
            public static getUniqueIdentifier(event: TimeEvent): string {
                return event.id.toString();
            }

            public static checkIfEventHasNoEnd(event: TimeEvent): boolean {
                return event.hasNoEnd;
            }

            public static getTitle(event: TimeEvent): string {
                return event.title;
            }

            public static isInstant(event: TimeEvent): boolean {
                return event.kind === TimeEventKind.Instant;
            }
        }

        /**
         * This is the function that will be exported by this d3.js plugin. It follows the d3.js convention for plugins,
         * returning a creator for a function that can be called within a selection chain.
         * 
         * To use it, start by creating an instance of it and configuring any properties:
         * 
         *     let chart: TimelinePlugin.TimelineChart = TimelinePlugin.chart();
         *     chart.height(600);
         *
         * Then use it in a chain:
         *
         *     d3.select('#some-element').datum(events).call(chart);
         * 
         * @returns {TimelineChart}
         */
        export function chart(): TimelineChart {
            // This plugin follows D3's conventions: https://bost.ocks.org/mike/chart/
            let
                height: number,
                laneHeight: number,
                currentDate: Date = new Date(),
                horizontalAxis: d3.svg.Axis,
                horizontalAxisElement: d3.Selection<any>,
                zoom: d3.behavior.Zoom<any>,
                eventsToBeRedrawn: d3.Selection<any>,
                currentDateLine: d3.Selection<any>,
                timelineWidth: number,
                timelineElement: d3.Selection<any>,
                timeScale: d3.time.Scale<number, number>,
                allocatedSlotsBySeries: d3.Map<Interval[][]> = d3.map<Interval[][]>([]);

            /**
             * Infers the domain based on the earliest and latests dates seen in the data set. It also adds some
             * pre-configured slack to the domain.
             *
             * @param eventsBySeries
             * @returns {Date[]}
             */
            function getTimelineDomain(eventsBySeries: { key: string; values: TimeEvent[] }[]): [Date, Date] {
                let
                    latestMoment: Moment,
                    earliestMoment: Moment;

                // earliestMoment = moment.min(events.map(function (event) {
                //     return event.begin;
                // }));

                // find the maximum date between all series
                latestMoment = moment.max(eventsBySeries.map(function (events: { key: string; values: TimeEvent[] }) {
                    // for this series, return the maximum date found
                    return moment.max(events.values.map(function (event: TimeEvent) {
                        return event.kind === TimeEventKind.Instant || event.hasNoEnd ? moment() : event.end;
                    }));
                }));

                // add some slack
                // clone() so to not change an event's original value
                // earliestMoment = earliestMoment.clone().subtract(CHART_LATERAL_PADDING_IN_YEARS, 'years');
                latestMoment = latestMoment.clone().add(CHART_LATERAL_PADDING_IN_YEARS, 'years');

                // using a fixed window starting from the latest moment
                earliestMoment = latestMoment.clone().subtract(300, 'years');

                return [earliestMoment.toDate(), latestMoment.toDate()];
            }

            /**
             * Gets the range, in pixels, that is going to be used to map domain values to the screen.
             *
             * @returns {number[]}
             */
            function getTimelineRange(): number[] {
                return [0, timelineWidth];
            }

            function calculateEventWidth(datum: TimeEvent): number {
                return timeScale(
                        datum.hasNoEnd ? currentDate : datum.end.toDate()) - timeScale(datum.begin.toDate()
                    );
            }

            function calculateEventLeftPosition(datum: TimeEvent): number {
                return timeScale(datum.begin.toDate());
            }

            function getCurrentDatePosition(): number {
                return timeScale(new Date());
            }

            function calculateEventTopPosition(eventToFit: TimeEvent): number {
                let
                    newInterval: Interval,
                    didFit: boolean = false,
                    level: number = 0;

                // the end of the event title may extrapolate the rectangle shape of that event, so we want to make
                // sure there's enough room for it not to overlap nearby events' shapes
                let endOfText = moment(timeScale.invert(timeScale(eventToFit.begin.toDate()) +
                    Epoch.Util.getTextWidth(eventToFit.title))).add(EVENT_RIGHT_MARGIN_IN_YEARS, 'years');

                let worstCaseEnd: Moment;
                if (eventToFit.kind === TimeEventKind.Instant) {
                    worstCaseEnd = endOfText;
                } else {
                    worstCaseEnd = eventToFit.hasNoEnd ?
                        moment(timeScale.domain()[1]) : moment.max(eventToFit.end, endOfText);
                }

                newInterval = [eventToFit.begin, worstCaseEnd];

                if (!allocatedSlotsBySeries.has(eventToFit.series)) {
                    allocatedSlotsBySeries.set(eventToFit.series, []);
                }
                let allocatedSlots = allocatedSlotsBySeries.get(eventToFit.series);

                // for each existing row
                didFit = allocatedSlots.some(function (row: Interval[], rowIndex: number): boolean {

                    // check if it passes the overlap test against all intervals that are already reserved in this row
                    didFit = row.every(function (interval: Interval): boolean {

                        return newInterval[1].isBefore(interval[0]) ||  // new event must end before this interval starts...
                            newInterval[0].isAfter(interval[1]);        // ...or it must begin after this interval ends.
                    });

                    // if there were no overlaps in this row, we occupy the intended interval
                    if (didFit) {
                        level = rowIndex;
                        row.push(newInterval);
                    }

                    return didFit;
                });

                // if none of the existing rows had a slot available
                if (!didFit) {
                    // open a new row and put it there
                    allocatedSlots.push([newInterval]);
                    level = allocatedSlots.length - 1;
                }

                return EVENT_VERTICAL_MARGIN + level * EVENT_HEIGHT_PLUS_MARGIN;
            }

            function drawRoundRectangle(event: TimeEvent): string {
                let
                    path: Util.SvgPathBuilder = new Util.SvgPathBuilder(true),
                    w: number = calculateEventWidth(event),
                    radius: number = EVENT_HEIGHT / 2;

                path
                    .moveTo(0, radius)
                    .roundTo(radius, 0);

                if (event.hasNoEnd) {
                    path
                        .horizontalTo(w)
                        .verticalTo(EVENT_HEIGHT);
                } else {
                    path
                        .horizontalTo(w - radius)
                        .roundTo(w, radius)
                        .roundTo(w - radius, EVENT_HEIGHT);
                }

                path
                    .horizontalTo(radius)
                    .roundTo(0, radius)
                    .close();

                return path.build();
            }

            function drawPin(): string {
                let
                    path: Util.SvgPathBuilder = new Util.SvgPathBuilder(true),
                    r: number = 2 / 6 * EVENT_HEIGHT;

                path
                    .moveTo(0, EVENT_HEIGHT)
                    .lineTo(-r, r)
                    .arcTo(r, r, 0, true, true, r, r)
                    .close();

                return path.build();
            }

            function generateEventCellPath(event: TimeEvent): string {

                switch (event.kind) {
                    case TimeEventKind.Instant:
                        return drawPin();
                    case TimeEventKind.Interval:
                        return drawRoundRectangle(event);
                    default:
                        throw new Error('Unknown event type');
                }
            }

            function drawLaneLabel(datum: { key: string }, index: number) {
                let lane = d3.select(this);
                lane
                    .append('rect')
                    .classed(EVENT_LANE_LABEL_CLASS_NAME, true)
                    .attr('width', 24)
                    .attr('height', laneHeight);
                lane
                    .append('text')
                    .attr('x', -laneHeight / 2)
                    .attr('dy', 17)
                    .attr('transform', 'rotate(-90)')
                    .attr('text-anchor', 'middle')
                    .text(datum.key);
            }

            function drawLaneSeparator(datum: any, index: number) {
                if (index > 0) {  // no need to draw separator before the first lane
                    let line = new Util.SvgPathBuilder(true);
                    line.moveTo(0, 0).horizontalTo(timelineWidth);
                    d3.select(this)
                        .append('path')
                        .classed(EVENT_LANE_SEPARATOR_CLASS_NAME, true)
                        .attr('d', line.build());
                }
            }

            function redraw() {
                // update current date
                currentDate = new Date();

                // update horizontal axis
                horizontalAxisElement.call(horizontalAxis);

                // recalculate events' displacement
                allocatedSlotsBySeries = d3.map<Interval[][]>();
                eventsToBeRedrawn
                    .attr('transform', transformTranslate(calculateEventLeftPosition, calculateEventTopPosition))
                    .select('path')
                    .attr('d', generateEventCellPath);

                currentDateLine
                    .attr('transform', transformTranslate(getCurrentDatePosition, 0));
            }

            function transformTranslate(
                fnX: {(datum: TimeEvent):number}|number,
                fnY: {(datum: TimeEvent):number}|number): (datum: TimeEvent)=>string {

                return function(datum: TimeEvent): string {
                    let x: number = typeof fnX === 'function' ? fnX(datum) : fnX;
                    let y: number = typeof fnY === 'function' ? fnY(datum) : fnY;
                    return 'translate(' + x + ',' + y + ')';
                }
            }

            function eventSeriesToEvents(events: { key: string; values: TimeEvent[] }): TimeEvent[] {
                return events.values;
            }

            return function(selection: d3.Selection<any>): void {
                // selection should be a single element
                selection.each(function (eventsBySeries: { key: string; values: TimeEvent[] }[]) {
                    // ToDo events.filter(removeEventsOutsideVisibleRange());

                    // bind time events to elements having an `.event` class
                    timelineElement = d3.select(this);
                    height = parseInt(timelineElement.style('height'), 10);
                    timelineWidth = parseInt(timelineElement.style('width'), 10);
                    laneHeight = height / eventsBySeries.length;

                    // prepare a clip path so that a lane's contents doesn't invade another lane's area
                    timelineElement
                        .append('clipPath')
                        .attr('id', 'timeline-lane-clip-path')
                        .append('rect')
                        .attr('width', timelineWidth)
                        .attr('height', laneHeight);

                    // prepare time scale
                    timeScale = d3.time.scale<number, number>()
                        .domain(getTimelineDomain(eventsBySeries))
                        .range(getTimelineRange());

                    // horizontal axis
                    horizontalAxis = d3.svg.axis()
                        .scale(timeScale)
                        .orient('bottom')
                        .innerTickSize(-height + 30);
                    horizontalAxisElement = timelineElement.append('g')
                        .call(horizontalAxis)
                        .classed(HORIZONTAL_AXIS_CLASS_NAME, true).classed('axis', true)
                        .attr('transform', transformTranslate(0, height - 30));

                    // swim lanes
                    let lanesSelection = timelineElement.selectAll('.' + EVENT_LANE_CLASS_NAME)
                        .data(eventsBySeries, function (datum: { key: string }) { return datum.key; } );
                    let newLanesSelection = lanesSelection.enter()
                        .append('g')
                        .classed(EVENT_LANE_CLASS_NAME, true)
                        .attr('clip-path', 'url(#timeline-lane-clip-path)')
                        .attr('data-name', function (datum: { key: string }) { return datum.key; })
                        .attr('transform', function (datum: any, index: number) {
                            // organize lanes across the vertical axis
                            return 'translate(0,' + (index * laneHeight) + ')';
                        });

                    // events per se
                    let eventsSelection = newLanesSelection.selectAll('.' + EVENT_CLASS_NAME)
                        .data(eventSeriesToEvents, TimeEvent.getUniqueIdentifier);
                    let newEventGroups = eventsSelection.enter()
                        .append('g')
                        .classed(EVENT_CLASS_NAME, true)
                        .classed(EVENT_INSTANT_CLASS_NAME, TimeEvent.isInstant)
                        .attr('transform', transformTranslate(calculateEventLeftPosition, calculateEventTopPosition));
                    newEventGroups
                        .append('path')
                        .attr('d', generateEventCellPath);
                        // .attr('filter', 'url(#event-drop-shadow)');
                    newEventGroups
                        .append('text')
                        .attr('x', 0).attr('y', 0)
                        .attr('dx', EVENT_TITLE_X).attr('dy', EVENT_TITLE_Y)
                        .text(TimeEvent.getTitle);

                    // add lane labels and separators above events
                    lanesSelection
                        .each(drawLaneLabel)
                        .each(drawLaneSeparator);

                    // add vertical line representing the current date
                    currentDateLine = timelineElement.append('g')
                        .classed(LINE_CURRENT_DATE_CLASS_NAME, true)
                        .attr('transform', transformTranslate(getCurrentDatePosition, 0));
                    currentDateLine
                        .append('rect')
                        .classed(FUTURE_CLASS_NAME, true)
                        .attr('height', height)
                        .attr('width', 1000);
                    currentDateLine
                        .append('line')
                        .attr('y2', height);
                    currentDateLine
                        .append('text')
                        .attr('x', -15)
                        .attr('dy', 15)
                        .attr('transform', 'rotate(-90)')
                        .text('Present');

                    // prepare a selection for every time we have to update the events
                    eventsToBeRedrawn = timelineElement.selectAll('.' + EVENT_CLASS_NAME);

                    // zoom/drag behavior
                    // The `<any>` type cast below is forcing a conversion from d3.time.Scale<Range, Output> to
                    // d3.behavior.zoom.Scale due to a bug in the Definitely-Typed script for d3.js
                    zoom = d3.behavior.zoom().on('zoom', redraw).x(<any>timeScale);
                    timelineElement.call(zoom);
                });
            };
        }
    }
}
