/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="typings/browser/ambient/moment/index.d.ts" />

module Epoch {
    import Moment = moment.Moment;

    export var allocatedSlots: Scientist[][] = [];
    const
        EVENT_MARGIN = 3,
        EVENT_HEIGHT = 30 + EVENT_MARGIN;
    var
        timeline: d3.Selection<any>,
        timeScale;

    /**
     * Simple pojo representing a scientist's lifespan.
     */
    class Scientist {
        public begin: Moment;
        public end: Moment;

        public static strToMoment(date: string): Moment {
            return (date === '-') ? moment() : moment(date, 'YYYY-MM-DD');
        }

        constructor(public name: string, begin: string, end: string) {
            this.begin = Scientist.strToMoment(begin);
            this.end = Scientist.strToMoment(end);
        }
    }

    function initialize(): void {
        timeline = d3.select('#timeline');
    }

    function loadAndDisplaySampleData(): void {
        d3.csv('sample.csv')
            .row(function (obj: {}): Scientist {
                return new Scientist(obj['name'], obj['begin'], obj['end']);
            })
            .get(function (err, scientists: Scientist[]) {
                if (!err) {
                    displayData(scientists);
                }
            });
    }

    /**
     * Infers the domain based on the earliest and latests dates seen in the data set. It also adds some preconfigured
     * slack to the domain.
     *
     * @param scientists
     * @returns {Date[]}
     */
    function getTimelineDomain(scientists: Scientist[]): Date[] {
        let
            earliestDate: Moment,
            latestDate: Moment;

        earliestDate = moment();
        latestDate = moment(Number.MIN_VALUE);

        scientists.forEach(function (scientist:Scientist) {
            earliestDate = moment.min(earliestDate, scientist.begin);
            latestDate = moment.max(latestDate, scientist.end);
        });

        // add some slack
        earliestDate = earliestDate.clone().subtract(10, 'years');  // clone() before changing the original value
        latestDate = latestDate.clone().add(10, 'years');

        return [earliestDate.toDate(), latestDate.toDate()];
    }

    /**
     * Gets the range, in pixels, that is going to be used to map domain values to the screen.
     *
     * @returns {number[]}
     */
    function getTimelineRange(): number[] {
        let timelineWidth = parseInt(timeline.style('width'), 10);
        return [0, timelineWidth];
    }

    function calculateEventWidth(datum: Scientist) {
        return (timeScale(datum.end) - timeScale(datum.begin)) + 'px';
    }

    function calculateEventLeftPosition(datum: Scientist) {
        return timeScale(datum.begin) + 'px';
    }

    function calculateEventTopPosition(scientistToFit: Scientist) {
        let
            didFit: boolean = false,
            level: number = 0;

        didFit = allocatedSlots.some(function (row: Scientist[], rowIndex: number): boolean {

            didFit = row.every(function (scientist: Scientist): boolean {
                return scientistToFit.end.isBefore(scientist.begin) || scientistToFit.begin.isAfter(scientist.end);
            });

            if (didFit) {
                level = rowIndex;
                row.push(scientistToFit);
            }

            return didFit;
        });

        if (!didFit) {
            // we have to open a new row
            allocatedSlots.push([scientistToFit]);
            level = allocatedSlots.length - 1;
        }

        return (EVENT_MARGIN + (level * EVENT_HEIGHT)) + 'px';
    }

    function displayData(scientists: Scientist[]): void {

        // map data to elements
        let data = timeline
            .selectAll('.event')
            .data(scientists, function (scientist: Scientist) {
                // uniquely identify a scientist by its name
                return scientist.name;
            });

        // prepare time scale
        timeScale = d3.time.scale()
            .domain(getTimelineDomain(scientists))
            .range(getTimelineRange());

        // process incoming data
        data.enter()
            .append('div')
            .classed('event', true)
            .style('left', calculateEventLeftPosition)
            .style('width', calculateEventWidth)
            .style('top', calculateEventTopPosition)
            .text(function (datum: Scientist) {
                return datum.name;
            });
    }

    export function run(): void {
        initialize();
        loadAndDisplaySampleData();
    }
}

Epoch.run();
