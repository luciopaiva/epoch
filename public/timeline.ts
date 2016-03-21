/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="index.ts" />

module Epoch {

    /**
     * This is a D3.js plugin to show a timeline chart. The timeline is draggable and zoomable.
     */
    export namespace TimelinePlugin {

        import Moment = moment.Moment;

        const
            EVENT_CLASS_NAME = 'event',
            EVENT_WITHOUT_END_CLASS_NAME = 'event-without-end',
            HORIZONTAL_AXIS_CLASS_NAME = 'timeline-horizontal-axis',
            EVENT_MARGIN = 3,
            EVENT_HEIGHT = 30 + EVENT_MARGIN,
            CHART_LATERAL_PADDING_IN_YEARS = 10,
            TIME_SPAN_RIGHT_MARGIN_IN_YEARS = 20,
            DEFAULT_HEIGHT = 600;

        type Interval = [Moment, Moment];

        export interface TimelineChart {
            (selection: d3.Selection<any>): void;
            height: { (value?: number): number|TimelineChart };
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

        export function chart(): TimelineChart {
            // This plugin follows D3's conventions: https://bost.ocks.org/mike/chart/
            let
                height = DEFAULT_HEIGHT,
                currentMoment: Moment = moment(),
                latestMoment: Moment,
                earliestMoment: Moment,
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

                earliestMoment = moment.min(events.map(function (event) {
                    return event.begin;
                }));
                latestMoment = moment.max(events.map(function (event) {
                    return event.hasNoEnd ? currentMoment : event.end;
                }));

                // add some slack
                // clone() so to not change an event's original value
                earliestMoment = earliestMoment.clone().subtract(CHART_LATERAL_PADDING_IN_YEARS, 'years');
                latestMoment = latestMoment.clone().add(CHART_LATERAL_PADDING_IN_YEARS, 'years');

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

            function calculateEventWidth(datum: TimeSpan) {
                return (timeScale(datum.hasNoEnd ?
                        latestMoment.toDate() : datum.end.toDate()) - timeScale(datum.begin.toDate())) + 'px';
            }

            function calculateEventLeftPosition(datum: TimeSpan) {
                return timeScale(datum.begin.toDate()) + 'px';
            }

            function calculateEventTopPosition(timeSpanToFit: TimeSpan) {
                let
                    newInterval: Interval,
                    didFit: boolean = false,
                    level: number = 0;

                // the end of the text to show may extrapolate the mark of the end of that event, so we want to make
                // sure there's enough room so it doesn't overlap
                let endOfText = moment(timeScale.invert(timeScale(timeSpanToFit.begin.toDate()) +
                    Epoch.Util.getTextWidth(timeSpanToFit.name))).add(TIME_SPAN_RIGHT_MARGIN_IN_YEARS, 'years');
                let worstCaseEnd = timeSpanToFit.hasNoEnd ? latestMoment : moment.max(timeSpanToFit.end, endOfText);

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

                return (EVENT_MARGIN + (level * EVENT_HEIGHT)) + 'px';
            }

            function redraw() {
                // update horizontal axis
                horizontalAxisElement.call(horizontalAxis);

                // recalculate events' displacement
                allocatedSlots = [];
                boundData
                    .style('left', calculateEventLeftPosition)
                    .style('width', calculateEventWidth)
                    .style('top', calculateEventTopPosition);
            }

            let main: TimelineChart = <TimelineChart>function(selection: d3.Selection<any>): void {
                // selection should be a single element
                selection.each(function (events) {
                    // bind time spans to sub-elements having an `.event` class
                    timelineElement = d3.select(this);
                    boundData = timelineElement.selectAll('.' + EVENT_CLASS_NAME)
                        .data(events, TimeSpan.getUniqueIndenfitier);

                    // prepare time scale
                    timeScale = d3.time.scale<number, number>()
                        .domain(getTimelineDomain(events))
                        .range(getTimelineRange());

                    // process incoming data
                    allocatedSlots = [];
                    boundData.enter()
                        .append('div')
                        .classed(EVENT_CLASS_NAME, true)
                        .classed(EVENT_WITHOUT_END_CLASS_NAME, TimeSpan.checkIfEventHasNoEnd)
                        .style('left', calculateEventLeftPosition)
                        .style('width', calculateEventWidth)
                        .style('top', calculateEventTopPosition)
                        .text(TimeSpan.getTitle);

                    // horizontal axis
                    horizontalAxis = d3.svg.axis().scale(timeScale).orient('bottom');
                    horizontalAxisElement = timelineElement.append('svg').classed(HORIZONTAL_AXIS_CLASS_NAME, true)
                        .call(horizontalAxis);

                    // zoom/drag behavior
                    // The `<any>` type cast below is forcing a conversion from d3.time.Scale<Range, Output> to
                    // d3.behavior.zoom.Scale due to a bug in the Definitely-Typed script for d3.js
                    zoom = d3.behavior.zoom().on('zoom', redraw).x(<any>timeScale);
                    timelineElement.call(zoom);
                });
            };

            main.height = function (value?: number): number|TimelineChart {
                if (typeof value === 'number') {
                    height = value;
                    return main;
                } else {
                    return height;
                }
            };

            return main;
        }
    }
}
