/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="index.ts" />
var Epoch;
(function (Epoch) {
    /**
     * This is a D3.js plugin to show a timeline chart. The timeline is draggable and zoomable.
     */
    var TimelinePlugin;
    (function (TimelinePlugin) {
        var EVENT_CLASS_NAME = 'timeline-event', EVENT_LANE_CLASS_NAME = 'timeline-lane', EVENT_LANE_LABEL_CLASS_NAME = 'timeline-lane-label', EVENT_LANE_SEPARATOR_CLASS_NAME = 'timeline-lane-separator', EVENT_INSTANT_CLASS_NAME = 'timeline-event-instant', HORIZONTAL_AXIS_CLASS_NAME = 'timeline-horizontal-axis', LINE_CURRENT_DATE_CLASS_NAME = 'timeline-current-date', FUTURE_CLASS_NAME = 'timeline-future', CHART_LATERAL_PADDING_IN_YEARS = 10, EVENT_VERTICAL_MARGIN = 5, EVENT_HEIGHT = 17, EVENT_TITLE_X = 10, EVENT_TITLE_Y = 12, EVENT_HEIGHT_PLUS_MARGIN = EVENT_HEIGHT + EVENT_VERTICAL_MARGIN, EVENT_RIGHT_MARGIN_IN_YEARS = 20;
        /**
         * Simple pojo representing a time event
         */
        var TimeEvent = (function () {
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
            function TimeEvent(id, series, kind, title, begin, end, description, url) {
                this.id = id;
                this.series = series;
                this.title = title;
                this.description = description;
                this.url = url;
                this.kind = parseInt(kind, 10);
                this.begin = TimeEvent.strToMoment(begin);
                this.end = TimeEvent.strToMoment(end);
                this.hasNoEnd = this.end === null;
            }
            TimeEvent.strToMoment = function (date) {
                var result = null;
                if (typeof date == 'string' && date.length > 0) {
                    result = moment(date, TimeEvent.VALID_DATE_FORMATS, true);
                }
                return result !== null && result.isValid() ? result : null;
            };
            /**
             * @param event event to be uniquely identified
             * @returns {string} returns a unique identifier for the event passed
             */
            TimeEvent.getUniqueIdentifier = function (event) {
                return event.id.toString();
            };
            TimeEvent.checkIfEventHasNoEnd = function (event) {
                return event.hasNoEnd;
            };
            TimeEvent.getTitle = function (event) {
                return event.title;
            };
            TimeEvent.isInstant = function (event) {
                return event.kind === 1 /* Instant */;
            };
            TimeEvent.VALID_DATE_FORMATS = [moment.ISO_8601, 'YYYY-MM-DD', 'YYYY'];
            return TimeEvent;
        }());
        TimelinePlugin.TimeEvent = TimeEvent;
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
        function chart() {
            // This plugin follows D3's conventions: https://bost.ocks.org/mike/chart/
            var height, laneHeight, currentDate = new Date(), horizontalAxis, horizontalAxisElement, zoom, eventsToBeRedrawn, currentDateLine, timelineWidth, timelineElement, timeScale, allocatedSlotsBySeries = d3.map([]);
            /**
             * Infers the domain based on the earliest and latests dates seen in the data set. It also adds some
             * pre-configured slack to the domain.
             *
             * @param eventsBySeries
             * @returns {Date[]}
             */
            function getTimelineDomain(eventsBySeries) {
                var latestMoment, earliestMoment;
                // earliestMoment = moment.min(events.map(function (event) {
                //     return event.begin;
                // }));
                // find the maximum date between all series
                latestMoment = moment.max(eventsBySeries.map(function (events) {
                    // for this series, return the maximum date found
                    return moment.max(events.values.map(function (event) {
                        return event.kind === 1 /* Instant */ || event.hasNoEnd ? moment() : event.end;
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
            function getTimelineRange() {
                return [0, timelineWidth];
            }
            function calculateEventWidth(datum) {
                return timeScale(datum.hasNoEnd ? currentDate : datum.end.toDate()) - timeScale(datum.begin.toDate());
            }
            function calculateEventLeftPosition(datum) {
                return timeScale(datum.begin.toDate());
            }
            function getCurrentDatePosition() {
                return timeScale(new Date());
            }
            function calculateEventTopPosition(eventToFit) {
                var newInterval, didFit = false, level = 0;
                // the end of the event title may extrapolate the rectangle shape of that event, so we want to make
                // sure there's enough room for it not to overlap nearby events' shapes
                var endOfText = moment(timeScale.invert(timeScale(eventToFit.begin.toDate()) +
                    Epoch.Util.getTextWidth(eventToFit.title))).add(EVENT_RIGHT_MARGIN_IN_YEARS, 'years');
                var worstCaseEnd;
                if (eventToFit.kind === 1 /* Instant */) {
                    worstCaseEnd = endOfText;
                }
                else {
                    worstCaseEnd = eventToFit.hasNoEnd ?
                        moment(timeScale.domain()[1]) : moment.max(eventToFit.end, endOfText);
                }
                newInterval = [eventToFit.begin, worstCaseEnd];
                if (!allocatedSlotsBySeries.has(eventToFit.series)) {
                    allocatedSlotsBySeries.set(eventToFit.series, []);
                }
                var allocatedSlots = allocatedSlotsBySeries.get(eventToFit.series);
                // for each existing row
                didFit = allocatedSlots.some(function (row, rowIndex) {
                    // check if it passes the overlap test against all intervals that are already reserved in this row
                    didFit = row.every(function (interval) {
                        return newInterval[1].isBefore(interval[0]) ||
                            newInterval[0].isAfter(interval[1]); // ...or it must begin after this interval ends.
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
            function drawRoundRectangle(event) {
                var path = new Epoch.Util.SvgPathBuilder(true), w = calculateEventWidth(event), radius = EVENT_HEIGHT / 2;
                path
                    .moveTo(0, radius)
                    .roundTo(radius, 0);
                if (event.hasNoEnd) {
                    path
                        .horizontalTo(w)
                        .verticalTo(EVENT_HEIGHT);
                }
                else {
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
            function drawPin() {
                var path = new Epoch.Util.SvgPathBuilder(true), r = 2 / 6 * EVENT_HEIGHT;
                path
                    .moveTo(0, EVENT_HEIGHT)
                    .lineTo(-r, r)
                    .arcTo(r, r, 0, true, true, r, r)
                    .close();
                return path.build();
            }
            function generateEventCellPath(event) {
                switch (event.kind) {
                    case 1 /* Instant */:
                        return drawPin();
                    case 2 /* Interval */:
                        return drawRoundRectangle(event);
                    default:
                        throw new Error('Unknown event type');
                }
            }
            function drawLaneLabel(datum, index) {
                var lane = d3.select(this);
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
            function drawLaneSeparator(datum, index) {
                if (index > 0) {
                    var line = new Epoch.Util.SvgPathBuilder(true);
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
                allocatedSlotsBySeries = d3.map();
                eventsToBeRedrawn
                    .attr('transform', transformTranslate(calculateEventLeftPosition, calculateEventTopPosition))
                    .select('path')
                    .attr('d', generateEventCellPath);
                currentDateLine
                    .attr('transform', transformTranslate(getCurrentDatePosition, 0));
            }
            function transformTranslate(fnX, fnY) {
                return function (datum) {
                    var x = typeof fnX === 'function' ? fnX(datum) : fnX;
                    var y = typeof fnY === 'function' ? fnY(datum) : fnY;
                    return 'translate(' + x + ',' + y + ')';
                };
            }
            function eventSeriesToEvents(events) {
                return events.values;
            }
            return function (selection) {
                // selection should be a single element
                selection.each(function (eventsBySeries) {
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
                    timeScale = d3.time.scale()
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
                    var lanesSelection = timelineElement.selectAll('.' + EVENT_LANE_CLASS_NAME)
                        .data(eventsBySeries, function (datum) { return datum.key; });
                    var newLanesSelection = lanesSelection.enter()
                        .append('g')
                        .classed(EVENT_LANE_CLASS_NAME, true)
                        .attr('clip-path', 'url(#timeline-lane-clip-path)')
                        .attr('data-name', function (datum) { return datum.key; })
                        .attr('transform', function (datum, index) {
                        // organize lanes across the vertical axis
                        return 'translate(0,' + (index * laneHeight) + ')';
                    });
                    // events per se
                    var eventsSelection = newLanesSelection.selectAll('.' + EVENT_CLASS_NAME)
                        .data(eventSeriesToEvents, TimeEvent.getUniqueIdentifier);
                    var newEventGroups = eventsSelection.enter()
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
                    zoom = d3.behavior.zoom().on('zoom', redraw).x(timeScale);
                    timelineElement.call(zoom);
                });
            };
        }
        TimelinePlugin.chart = chart;
    })(TimelinePlugin = Epoch.TimelinePlugin || (Epoch.TimelinePlugin = {}));
})(Epoch || (Epoch = {}));
/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="typings/browser/ambient/moment/index.d.ts" />
/// <reference path="timeline.ts" />
var Epoch;
(function (Epoch) {
    var TimeEvent = Epoch.TimelinePlugin.TimeEvent;
    var chart;
    function run() {
        var id = 1;
        chart = Epoch.TimelinePlugin.chart();
        function nestBySeries(event) {
            return event.series;
        }
        d3.csv('sample.csv')
            .row(function (obj) {
            return new TimeEvent(id++, obj['series'], obj['kind'], obj['title'], obj['begin'], obj['end'], obj['description'], obj['url']);
        })
            .get(function (err, events) {
            if (!err) {
                var eventsBySeries = d3.nest().key(nestBySeries).entries(events);
                d3.select('#timeline').datum(eventsBySeries).call(chart);
            }
            else {
                throw err;
            }
        });
    }
    Epoch.run = run;
})(Epoch || (Epoch = {}));
Epoch.run();
/// <reference path="../index.ts" />
var Epoch;
(function (Epoch) {
    var Util;
    (function (Util) {
        var SvgPathBuilder = (function () {
            function SvgPathBuilder(useAbsolute) {
                this.useAbsolute = useAbsolute;
                this.path = [];
                this.currentPosition = [0, 0];
                this.initialPosition = [0, 0];
            }
            SvgPathBuilder.prototype.saveCurrentPosition = function (x, y) {
                if (x !== null) {
                    this.currentPosition[0] = x;
                }
                if (y !== null) {
                    this.currentPosition[1] = y;
                }
            };
            SvgPathBuilder.prototype.saveInitialPosition = function (x, y) {
                if (x !== null && y !== null) {
                    this.initialPosition[0] = x;
                    this.initialPosition[1] = y;
                }
            };
            SvgPathBuilder.prototype.absolute = function () {
                this.useAbsolute = true;
                return this;
            };
            SvgPathBuilder.prototype.relative = function () {
                this.useAbsolute = false;
                return this;
            };
            SvgPathBuilder.prototype.moveTo = function (x, y) {
                this.path.push(this.useAbsolute ? 'M' : 'm', x, y);
                this.saveInitialPosition(x, y);
                this.saveCurrentPosition(x, y);
                return this;
            };
            SvgPathBuilder.prototype.lineTo = function (x, y) {
                this.path.push(this.useAbsolute ? 'L' : 'l', x, y);
                this.saveInitialPosition(x, y);
                this.saveCurrentPosition(x, y);
                return this;
            };
            SvgPathBuilder.prototype.simpleBezierTo = function (x2, y2, x, y) {
                this.path.push(this.useAbsolute ? 'S' : 's', x2, y2, x, y);
                this.saveCurrentPosition(x, y);
                return this;
            };
            SvgPathBuilder.prototype.bezierTo = function (x1, y1, x2, y2, x, y) {
                this.path.push(this.useAbsolute ? 'C' : 'c', x1, y1, x2, y2, x, y);
                this.saveCurrentPosition(x, y);
                return this;
            };
            SvgPathBuilder.prototype.horizontalTo = function (x) {
                this.path.push(this.useAbsolute ? 'H' : 'h', x);
                this.saveCurrentPosition(x, null);
                return this;
            };
            SvgPathBuilder.prototype.verticalTo = function (y) {
                this.path.push(this.useAbsolute ? 'V' : 'v', y);
                this.saveCurrentPosition(null, y);
                return this;
            };
            SvgPathBuilder.prototype.arcTo = function (rx, ry, rAxisRotation, largeArcFlag, sweepFlag, x, y) {
                this.path.push(this.useAbsolute ? 'A' : 'a', rx, ry, rAxisRotation, largeArcFlag ? 1 : 0, sweepFlag ? 1 : 0, x, y);
                this.saveCurrentPosition(x, y);
                return this;
            };
            SvgPathBuilder.prototype.close = function () {
                this.path.push('Z');
                this.saveCurrentPosition(this.initialPosition[0], this.initialPosition[1]);
                return this;
            };
            /**
             * Draws a concave curve starting from the current position, where the concavity is defined by the `isClockwise`
             * parameter.
             *
             * @param x the final x position
             * @param y the final y position
             * @param isClockwise
             * @returns {SvgPathBuilder}
             */
            SvgPathBuilder.prototype.roundTo = function (x, y, isClockwise) {
                if (isClockwise === void 0) { isClockwise = true; }
                var rx, ry;
                rx = x - this.currentPosition[0];
                ry = y - this.currentPosition[1];
                return this.arcTo(rx, ry, 0, !isClockwise, isClockwise, x, y);
            };
            SvgPathBuilder.prototype.build = function () {
                return this.path.join(' ');
            };
            return SvgPathBuilder;
        }());
        Util.SvgPathBuilder = SvgPathBuilder;
    })(Util = Epoch.Util || (Epoch.Util = {}));
})(Epoch || (Epoch = {}));
/// <reference path="../index.ts" />
var Epoch;
(function (Epoch) {
    var Util;
    (function (Util) {
        // re-used every time the method gets called
        var getTextWidthCanvas = document.createElement('canvas');
        /**
         * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
         *
         * @param {String} text The text to be rendered.
         *
         * @see http://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
         */
        function getTextWidth(text) {
            var FONT = '8pt arial';
            var context = getTextWidthCanvas.getContext('2d');
            context.font = FONT;
            var metrics = context.measureText(text);
            return metrics.width;
        }
        Util.getTextWidth = getTextWidth;
    })(Util = Epoch.Util || (Epoch.Util = {}));
})(Epoch || (Epoch = {}));
//# sourceMappingURL=app.js.map