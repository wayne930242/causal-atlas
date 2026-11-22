# Adapters for the documented dosearch and causaleffect APIs.
run_case <- function(case) {
  nodes <- unlist(case$nodes)
  x <- unlist(case$x)
  y <- unlist(case$y)
  w <- unlist(case$w)
  # igraph preserves isolated vertices and parallel edges (bows).
  graph <- igraph::make_empty_graph(length(nodes), directed = TRUE)
  graph <- igraph::set_vertex_attr(graph, "name", value = nodes)
  arrows <- lapply(case$directed, unlist)
  arcs <- lapply(case$bidirected, unlist)
  edges <- c(arrows, arcs, lapply(arcs, rev))
  if (length(edges)) {
    graph <- igraph::add_edges(graph, unlist(edges), attr = list(
      description = c(rep("", length(arrows)), rep("U", 2L * length(arcs)))
    ))
  }

  draw <- case$id %in% c("backdoor", "frontdoor", "napkin")
  data <- sprintf("P(%s)", paste(nodes, collapse = ","))
  intervention <- sprintf("do(%s)", paste(x, collapse = ","))
  query <- sprintf("P(%s|%s)", paste(y, collapse = ","),
                   paste(c(intervention, w), collapse = ","))
  warnings <- list()
  capture_warning <- function(tool) function(w) {
    message <- conditionMessage(w)
    if (case$id != "random-10" || length(edges) ||
        message != "number of items to replace is not a multiple of replacement length") stop(w)
    warnings[[length(warnings) + 1L]] <<- list(tool = tool, message = message)
    invokeRestart("muffleWarning")
  }
  ds <- withCallingHandlers(
    dosearch::dosearch(data, query, graph, control = list(draw_derivation = draw)),
    warning = capture_warning("dosearch")
  )

  # Only the documented non-identification error becomes a negative verdict;
  # package, input and other unexpected failures must stop the generator.
  ce <- tryCatch(
    withCallingHandlers(causaleffect::causal.effect(y, x, z = w, G = graph),
                        warning = capture_warning("causaleffect")),
    error = function(e) {
      if (!identical(conditionMessage(e), "Not identifiable.")) stop(e)
      NULL
    }
  )
  ce_id <- is.character(ce) && length(ce) == 1L
  ds_id <- dosearch::is_identifiable(ds)
  list(
    id = case$id,
    verdicts = list(dosearch = ds_id, causaleffect = ce_id),
    formulas = list(dosearch = if (ds_id) dosearch::get_formula(ds) else "",
                    causaleffect = if (ce_id) ce else ""),
    warnings = as.list(warnings),
    derivation = if (draw) dosearch::get_derivation(ds) else NULL
  )
}

options(warn = 2)
cases <- jsonlite::fromJSON(file("stdin"), simplifyVector = FALSE)
results <- lapply(cases, function(case) tryCatch(run_case(case), error = function(e) {
  stop(sprintf("%s: %s", case$id, conditionMessage(e)), call. = FALSE)
}))
versions <- lapply(c("dosearch", "causaleffect"), function(pkg) as.character(packageVersion(pkg)))
names(versions) <- c("dosearch", "causaleffect")
writeLines(jsonlite::toJSON(list(tools = versions, cases = results), auto_unbox = TRUE))
