import HyperE, { Request, Response } from "hyper-express";
import moment from "moment";

import { connection as db } from "../config/database";
import {
  addNewTask,
  checkFeatureStatus,
  createFeatureHistory,
  getLastDataByUsername,
  updateFeatureCycle,
} from "../model";
import { ITask, TAddNewTask, TTimeCalculation } from "../types/features/task";

const features_route = new HyperE.Router();

features_route.get("/last/:username", async (req, res) => {
  const { username } = req.params;
  const result = await getLastDataByUsername(username);
  res.json({ features: result });
});

features_route.post("/add", async (req: Request, res: Response) => {
  try {
    const { username, title, level }: TAddNewTask = await req.json();
    const result = await addNewTask({ username, title, level });
    console.log("🚀 ~ features_route.post ~ result:", result);
    res.status(200).json({
      id: result.insertId,
    });
  } catch (error) {
    console.log(error.sqlMessage);

    res.status(400).json({
      message: error?.sqlMessage ?? "Failed add new task",
    });
  }
});

async function timeCalculation({
  started_time,
  break_time,
  status,
  incrementCycle,
  level,
  username,
  id,
}: TTimeCalculation) {
  const startedMoment = moment(started_time, "HH:mm:ss");
  const breakMoment = moment(break_time, "HH:mm:ss");

  const duration = moment.duration(breakMoment.diff(startedMoment));
  const total_hours = moment.utc(duration.asMilliseconds()).format("HH:mm:ss");

  try {
    console.log(started_time);
    if (started_time && break_time && status == "break") {
      const newCycle = await updateFeatureCycle({
        id,
        username,
        level,
        incrementCycle,
      });

      if (newCycle) await createFeatureHistory({ id, username, total_hours });
      return newCycle;
    }
    return null;
  } catch (error) {
    throw error;
  }
}

features_route.put("/resume", async (req: Request, res: Response) => {
  try {
    const { id, username, level }: ITask = await req.json();
    const { started_time, break_time, status, cycle } =
      await checkFeatureStatus({ id, username });

    console.log(started_time, break_time);
    if (status !== "break") {
      return res.status(400).json({
        message: `You are still ${status}`,
        status: 400,
        data: null,
      });
    }

    const incrementCycle = Number(cycle) + 1;

    const newTime = await timeCalculation({
      started_time,
      break_time,
      status,
      incrementCycle,
      level,
      username,
      id,
    });
    console.log("newTime", newTime);
    if (newTime) {
      return res.status(200).json({ message: "Success Resume task" });
    }
    return res.status(400).json({ message: "Failed Resume task" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: error?.sqlMessage ?? "Failed" });
  }
});

features_route.put("/finish", async (req, res) => {
  const { id, username } = await req.json();
  db.query(
    `UPDATE features SET end_time=NOW(), status='done' WHERE id='${id}' AND username='${username}'`,
    (err, _) => {
      if (err)
        return res.status(400).json({
          id,
          message: "updating feature end_time failed, sorry!",
        });
      return res.status(200).json({
        id,
        message: "Sucess finish your task!!",
      });
    }
  );
});

features_route.put("/break", async (req, res) => {
  const { id, username } = await req.json();
  db.query(
    `UPDATE features SET break_time=NOW(), status='break' WHERE id='${id}' AND username='${username}'`,
    (err, _) => {
      if (err)
        return res.status(200).json({
          id,
          message:
            err?.sqlMessage ?? "updating feature end_time failed, sorry!",
        });
      return res.status(200).json({ id, message: "Success Break!!" });
    }
  );
});

export default features_route;
