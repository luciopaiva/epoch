/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="typings/browser/ambient/moment/index.d.ts" />
/// <reference path="timeline.ts" />

module Epoch {
    import TimeEvent = Epoch.TimelinePlugin.TimeEvent;

    var
        chart: TimelinePlugin.TimelineChart;

    export function run(): void {
        let id = 1;
        chart = TimelinePlugin.chart();

        function nestBySeries(event: TimeEvent) {
            return event.series;
        }

        d3.csv('sample.csv')
            .row(function (obj: {}): TimeEvent {
                return new TimeEvent(id++, obj['series'], obj['kind'], obj['title'], obj['begin'], obj['end'],
                    obj['description'], obj['url']);
            })
            .get(function (err, events: TimeEvent[]) {
                if (!err) {
                    let eventsBySeries = d3.nest().key(nestBySeries).entries(events);
                    d3.select('#timeline').datum(eventsBySeries).call(chart);
                } else {
                    throw err;
                }
            });
    }
}

Epoch.run();
