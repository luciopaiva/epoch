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
            HORIZONTAL_AXIS_CLASS_NAME = 'timeline-horizontal-axis',
            LINE_CURRENT_DATE_CLASS_NAME = 'timeline-current-date',
            EVENT_VERTICAL_MARGIN = 4,
            EVENT_HEIGHT = 30,
            EVENT_HEIGHT_PLUS_MARGIN = EVENT_HEIGHT + EVENT_VERTICAL_MARGIN,
            CHART_LATERAL_PADDING_IN_YEARS = 10,
            TIME_SPAN_RIGHT_MARGIN_IN_YEARS = 20;

        type Interval = [Moment, Moment];

        export interface TimelineChart {
            (selection: d3.Selection<any>): void;
        }

        /**
         * Simple pojo representing a time span
         */
        export class TimeSpan {
            public begin: Moment;
            public end: Moment;
            public hasNoEnd: boolean;

            public static strToMoment(date: string): Moment {
                return (date === '-') ? null : moment(date, 'YYYY-MM-DD');
            }

            /**
             * @param event event to be uniquely identified
             * @returns {string} returns a unique identifier for the event passed
             */
            public static getUniqueIndenfitier(event: TimeSpan): string {
                return event.name;
            }

            public static checkIfEventHasNoEnd(event: TimeSpan): boolean {
                return event.hasNoEnd;
            }

            public static getTitle(event: TimeSpan): string {
                return event.name;
            }

            constructor(public name: string, begin: string, end: string) {
                this.begin = TimeSpan.strToMoment(begin);
                this.end = TimeSpan.strToMoment(end);
                this.hasNoEnd = end === '-';
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
                horizontalAxis: d3.svg.Axis,
                horizontalAxisElement: d3.Selection<any>,
                zoom: d3.behavior.Zoom<any>,
                boundData: d3.selection.Update<any>,
                timelineElement: d3.Selection<any>,
                timeScale: d3.time.Scale<number, number>,
                allocatedSlots: Interval[][] = [];

            /**
             * Infers the domain based on the earliest and latests dates seen in the data set. It also adds some
             * pre-configured slack to the domain.
             *
             * @param events
             * @returns {Date[]}
             */
            function getTimelineDomain(events: TimeSpan[]): [Date, Date] {
                let
                    latestMoment: Moment,
                    earliestMoment: Moment;

                // earliestMoment = moment.min(events.map(function (event) {
                //     return event.begin;
                // }));
                latestMoment = moment.max(events.map(function (event) {
                    return event.hasNoEnd ? moment() : event.end;
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
                let timelineWidth = parseInt(timelineElement.style('width'), 10);
                return [0, timelineWidth];
            }

            function calculateEventWidth(datum: TimeSpan): number {
                return timeScale(datum.hasNoEnd ? new Date() : datum.end.toDate()) - timeScale(datum.begin.toDate());
            }

            function calculateEventLeftPosition(datum: TimeSpan): number {
                return timeScale(datum.begin.toDate());
            }

            function getCurrentDatePosition(): number {
                return timeScale(new Date());
            }

            function calculateEventTopPosition(timeSpanToFit: TimeSpan): number {
                let
                    newInterval: Interval,
                    didFit: boolean = false,
                    level: number = 0;

                // the end of the text to show may extrapolate the mark of the end of that event, so we want to make
                // sure there's enough room so it doesn't overlap
                let endOfText = moment(timeScale.invert(timeScale(timeSpanToFit.begin.toDate()) +
                    Epoch.Util.getTextWidth(timeSpanToFit.name))).add(TIME_SPAN_RIGHT_MARGIN_IN_YEARS, 'years');
                let worstCaseEnd = timeSpanToFit.hasNoEnd ?
                    moment(timeScale.domain()[1]) : moment.max(timeSpanToFit.end, endOfText);

                newInterval = [timeSpanToFit.begin, worstCaseEnd];

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

            function generateEventCellPath(event: TimeSpan): string {
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

            function redraw() {
                // update horizontal axis
                horizontalAxisElement.call(horizontalAxis);

                // recalculate events' displacement
                allocatedSlots = [];
                boundData
                    .attr('transform', transformTranslate(calculateEventLeftPosition, calculateEventTopPosition))
                    .select('path')
                    .attr('d', generateEventCellPath);

                timelineElement.select('.' + LINE_CURRENT_DATE_CLASS_NAME)
                    .attr('transform', transformTranslate(getCurrentDatePosition, 0));
            }

            function transformTranslate(
                fnX: {(datum: TimeSpan):number}|number,
                fnY: {(datum: TimeSpan):number}|number): (datum: TimeSpan)=>string {

                return function(datum: TimeSpan): string {
                    let x: number = typeof fnX === 'function' ? fnX(datum) : fnX;
                    let y: number = typeof fnY === 'function' ? fnY(datum) : fnY;
                    return 'translate(' + x + ',' + y + ')';
                }
            }

            return function(selection: d3.Selection<any>): void {
                // selection should be a single element
                selection.each(function (events: TimeSpan[]) {
                    // ToDo events.filter(removeEventsOutsideVisibleRange());

                    // bind time spans to sub-elements having an `.event` class
                    timelineElement = d3.select(this);
                    height = parseInt(timelineElement.style('height'), 10);
                    boundData = timelineElement.selectAll('.' + EVENT_CLASS_NAME)
                        .data(events, TimeSpan.getUniqueIndenfitier);

                    // prepare time scale
                    timeScale = d3.time.scale<number, number>()
                        .domain(getTimelineDomain(events))
                        .range(getTimelineRange());

                    // process incoming data
                    allocatedSlots = [];
                    let newEventGroups = boundData.enter()
                        .append('g')
                        .classed(EVENT_CLASS_NAME, true)
                        .attr('transform', transformTranslate(calculateEventLeftPosition, calculateEventTopPosition));

                    newEventGroups
                        .append('path')
                        .attr('d', generateEventCellPath)
                        .attr('filter', 'url(#event-drop-shadow)');

                    newEventGroups
                        .append('text')
                        .attr('x', 0).attr('y', 0)
                        .attr('dx', 10).attr('dy', 20)
                        .text(TimeSpan.getTitle);

                    // add vertical line representing the current date
                    timelineElement.append('g')
                        .classed(LINE_CURRENT_DATE_CLASS_NAME, true)
                        .attr('transform', transformTranslate(getCurrentDatePosition, 0))
                        .append('rect')
                        .attr('width', 1)
                        .attr('height', height);

                    // horizontal axis
                    horizontalAxis = d3.svg.axis().scale(timeScale).orient('bottom');
                    horizontalAxisElement = timelineElement.append('g')
                        .call(horizontalAxis)
                        .classed(HORIZONTAL_AXIS_CLASS_NAME, true).classed('axis', true)
                        .attr('transform', transformTranslate(0, height - 30));

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
