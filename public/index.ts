/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="typings/browser/ambient/moment/index.d.ts" />
/// <reference path="timeline.ts" />

module Epoch {
    import TimeSpan = Epoch.TimelinePlugin.TimeEvent;

    var
        chart: TimelinePlugin.TimelineChart;

    export function run(): void {
        chart = TimelinePlugin.chart();

        d3.csv('sample.csv')
            .row(function (obj: {}): TimeSpan {
                return new TimeSpan(obj['series'], obj['kind'], obj['title'], obj['begin'], obj['end'],
                    obj['description'], obj['url']);
            })
            .get(function (err, events: TimeSpan[]) {
                if (!err) {
                    d3.select('#timeline').datum(events).call(chart);
                } else {
                    throw err;
                }
            });
    }
}

Epoch.run();
