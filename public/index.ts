/// <reference path="typings/browser/ambient/d3/index.d.ts" />
/// <reference path="typings/browser/ambient/moment/index.d.ts" />
/// <reference path="timeline.ts" />

module Epoch {
    import TimeSpan = Epoch.TimelinePlugin.TimeSpan;

    var
        chart: TimelinePlugin.TimelineChart;

    export function run(): void {
        chart = TimelinePlugin.chart();

        d3.csv('sample.csv')
            .row(function (obj: {}): TimeSpan {
                return new TimeSpan(obj['name'], obj['begin'], obj['end']);
            })
            .get(function (err, events: TimeSpan[]) {
                if (!err) {
                    d3.select('#timeline').datum(events).call(chart);
                } else {
                    throw new Error(err);
                }
            });
    }
}

Epoch.run();
